require("dotenv").config();
const { Client } = require("pg");
const fs = require("fs");
const path = require("path");

// Mirrors geiger-events's scripts/run-sqls.js. Executes every
// supabase/sqls/*.sql in filename order against the project in STRING_URI.
// Statements are split on top-level `;` (dollar-quoted function bodies kept
// intact), create table/index are made idempotent and skipped when they
// already exist, and everything else re-runs safely because the SQL files are
// written idempotently. Add a feature -> drop a new .sql in the folder and
// re-run `node scripts/run-sqls.js`.

const STRING_URI = process.env.STRING_URI;

if (!STRING_URI) {
  console.error("ERROR: STRING_URI environment variable is not set.");
  process.exit(1);
}

const SQL_DIR = "supabase/sqls";

function getSqlFiles() {
  const dir = path.join(process.cwd(), SQL_DIR);
  if (!fs.existsSync(dir)) {
    return [];
  }
  return fs
    .readdirSync(dir)
    .filter((file) => file.endsWith(".sql"))
    .sort()
    .map((file) => `${SQL_DIR}/${file}`);
}

const SQL_FILES = getSqlFiles();

function extractTableName(stmt) {
  const match = stmt.match(
    /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:(\w+)\.)?(\w+)/i,
  );
  if (!match) return null;
  return { schema: match[1] || "public", name: match[2] };
}

function extractIndexName(stmt) {
  const match = stmt.match(
    /create\s+(?:unique\s+)?index\s+(?:if\s+not\s+exists\s+)?(\w+)/i,
  );
  return match ? match[1] : null;
}

function addIfNotExists(stmt) {
  if (/^create\s+table\s+/i.test(stmt) && !/if\s+not\s+exists/i.test(stmt)) {
    return stmt.replace(/create\s+table\s+/i, "create table if not exists ");
  }
  if (
    /^create\s+(?:unique\s+)?index\s+/i.test(stmt) &&
    !/if\s+not\s+exists/i.test(stmt)
  ) {
    return stmt.replace(/create\s+(?:unique\s+)?index\s+/i, "$&if not exists ");
  }
  return stmt;
}

// Statements that reset/destroy existing tables or data. Blocked on a normal
// run so adding new .sql files can only ever create/extend — never reset. Note:
// drop trigger/policy/index/function are NOT destructive (no data) and stay
// allowed, since idempotent re-creation relies on them.
function isDestructive(stmt) {
  return (
    /^\s*drop\s+table\b/i.test(stmt) ||
    /^\s*drop\s+schema\b/i.test(stmt) ||
    /^\s*truncate\b/i.test(stmt) ||
    /^\s*delete\s+from\b/i.test(stmt)
  );
}

function stripLeadingComments(stmt) {
  const lines = stmt.split("\n");
  let i = 0;
  while (
    i < lines.length &&
    (lines[i].trim() === "" || lines[i].trim().startsWith("--"))
  ) {
    i++;
  }
  return lines.slice(i).join("\n").trim();
}

function splitStatements(sql) {
  const statements = [];
  let current = "";
  let inDollarQuote = false;
  let dollarTag = "";
  let i = 0;

  while (i < sql.length) {
    if (sql[i] === "$") {
      const tagMatch = sql.slice(i).match(/^\$([a-zA-Z_]*)\$/);
      if (tagMatch) {
        const tag = tagMatch[0];
        if (!inDollarQuote) {
          inDollarQuote = true;
          dollarTag = tag;
          current += tag;
          i += tag.length;
          continue;
        } else if (tag === dollarTag) {
          inDollarQuote = false;
          current += tag;
          i += tag.length;
          dollarTag = "";
          continue;
        }
      }
    }

    if (sql[i] === ";" && !inDollarQuote) {
      current += ";";
      const code = stripLeadingComments(current);
      if (code) {
        statements.push(code);
      }
      current = "";
      i++;
      continue;
    }

    if (sql[i] === "-" && sql[i + 1] === "-" && !inDollarQuote) {
      const lineEnd = sql.indexOf("\n", i);
      if (lineEnd === -1) {
        current += sql.slice(i);
        break;
      }
      current += sql.slice(i, lineEnd + 1);
      i = lineEnd + 1;
      continue;
    }

    current += sql[i];
    i++;
  }

  const code = stripLeadingComments(current);
  if (code) {
    statements.push(code);
  }

  return statements;
}

async function tableExists(client, schema, tableName) {
  const res = await client.query(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.tables
       WHERE table_schema = $1 AND table_name = $2
     ) AS exists`,
    [schema, tableName],
  );
  return res.rows[0].exists;
}

async function indexExists(client, indexName) {
  const res = await client.query(
    `SELECT EXISTS (
       SELECT 1 FROM pg_indexes WHERE indexname = $1
     ) AS exists`,
    [indexName],
  );
  return res.rows[0].exists;
}

async function run() {
  const client = new Client({
    connectionString: STRING_URI,
    ssl: { rejectUnauthorized: false },
  });

  // Table/data resets require the explicit --clean opt-in. Without it, a normal
  // db:push is purely additive (create-if-missing + alter-add-column) and never
  // drops or truncates, no matter what future .sql files contain.
  const allowDestructive = process.argv.includes("--clean");

  try {
    await client.connect();
    console.log("Connected to database.\n");

    // Shared suite DB — a blanket drop would destroy other apps' data, so
    // --clean is scoped to this app's own comms.* tables only.
    if (allowDestructive) {
      console.log("Dropping comms.* app tables (comms app only)...");
      await client.query(`
        drop table if exists
          comms.messages,
          comms.conversations,
          comms.contacts
        cascade`);
      console.log("Clean complete.\n");
    }

    for (const file of SQL_FILES) {
      const filePath = path.join(process.cwd(), file);
      if (!fs.existsSync(filePath)) {
        console.log(`SKIP (not found): ${file}`);
        continue;
      }

      console.log(`\n========== ${file} ==========`);
      const sql = fs.readFileSync(filePath, "utf-8");
      const statements = splitStatements(sql);

      for (const rawStmt of statements) {
        const stmt = addIfNotExists(rawStmt);
        const table = extractTableName(stmt);
        const tableLabel = table ? `${table.schema}.${table.name}` : null;
        const indexName = extractIndexName(stmt);

        // Never reset existing tables/data on a normal run — only --clean may.
        if (isDestructive(stmt) && !allowDestructive) {
          console.log(
            `  BLOCKED (destructive, pass --clean to allow): ${stmt
              .slice(0, 70)
              .replace(/\n/g, " ")}`,
          );
          continue;
        }

        if (
          table &&
          /^create\s+table\s+/i.test(stmt) &&
          (await tableExists(client, table.schema, table.name))
        ) {
          console.log(`  SKIP (exists): table ${tableLabel}`);
          continue;
        }

        if (
          indexName &&
          /^create\s+(?:unique\s+)?index\s+/i.test(stmt) &&
          (await indexExists(client, indexName))
        ) {
          console.log(`  SKIP (exists): index ${indexName}`);
          continue;
        }

        try {
          await client.query(stmt);
          const label = tableLabel
            ? `table ${tableLabel}`
            : indexName
              ? `index ${indexName}`
              : stmt.slice(0, 80).replace(/\n/g, " ");
          console.log(`  OK: ${label}`);
        } catch (err) {
          console.error("Statement error:");
          console.error(err);
        }
      }
    }

    console.log("\nDone.");
  } catch (err) {
    console.error("Fatal error:");
    console.error(err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

run();
