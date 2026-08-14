import { tool } from "langchain";
import type { DatabaseSync } from "node:sqlite";
import * as z from "zod";

export function initTools(database: DatabaseSync) {
  /*
   * Add Expenses Tool
   */
  const addExpense = tool(
    ({ title, amount }) => {
      const date = new Date().toISOString().split("T")[0]!;

      const stmt = database.prepare(
        `INSERT INTO expenses (title, amount, date) VALUES (?, ?, ?)`,
      );

      stmt.run(title, amount, date);

      return JSON.stringify({ status: "success!" });
    },
    {
      name: "add_expense",
      description: "Add the given expense to database",
      schema: z.object({
        title: z.string().describe("The expense title"),
        amount: z.number().describe("The amount spent"),
      }),
    },
  );

  /*
   * Get Expenses Tool
   */
  const getExpenses = tool(
    ({ from, to }) => {
      const stmt = database.prepare(
        `SELECT * FROM expenses WHERE date BETWEEN ? AND ?`,
      );

      const rows = stmt.all(from, to);
      return JSON.stringify(rows);
    },
    {
      name: "get_expenses",
      description: "Get the expenses from database for given date range",
      schema: z.object({
        from: z.string().describe("Start date in YYYY-MM-DD fromat"),
        to: z.string().describe("End date in YYYY-MM-DD format"),
      }),
    },
  );

  /*
   * Generate Chart Tool
   */
  const generateChart = tool(
    ({ from, to, groupBy }) => {
      // YYYY-MM-DD -> month -> 2025-11-26 -> 2025-11
      let sqlGroupBy: string;

      //todo: will change this variable according to groupBy
      switch (groupBy) {
        case "month":
          sqlGroupBy = `strftime('%Y-%m', date)`;
          break;

        case "week":
          sqlGroupBy = `strftime('%Y-W%W', date)`;
          break;

        case "date":
          sqlGroupBy = `date`;
          break;

        default:
          sqlGroupBy = `strftime('%Y-%m', date)`;
      }

      const query = `
      SELECT ${sqlGroupBy} as period, SUM(amount) as total
      FROM expenses
      WHERE date BETWEEN ? AND ?
      GROUP BY period
      ORDER BY period
      `;

      const stmt = database.prepare(query);
      const rows = stmt.all(from, to);

      const result = rows.map((row) => {
        return {
          [groupBy]: row.period,
          amount: row.total,
        };
      });

      return JSON.stringify({
        type: "chart",
        data: result,
        labelKey: groupBy,
      });
    },
    {
      name: "generate_expense_chart",
      description:
        "Generate expense charts by querying the database and grouping expenses by month, week or date",
      schema: z.object({
        from: z.string().describe("Start date in YYYY-MM-DD fromat"),
        to: z.string().describe("End date in YYYY-MM-DD format"),
        groupBy: z
          .enum(["month", "week", "date"])
          .describe("How to group the data: by month, week or date"),
      }),
    },
  );

  return [addExpense, getExpenses, generateChart];
}
