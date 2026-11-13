import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel.js";
import { type MutationCtx, mutation, type QueryCtx, query } from "./_generated/server.js";
import { type Product, vProduct } from "./validators.js";

// An organization sells a few dozen products at most; this only bounds the read.
const MAX_PRODUCTS = 500;

function withoutSystemFields({ _id, _creationTime, ...product }: Doc<"polarProducts">): Product {
  return product;
}

/** A product by its Polar id, or null if none is mirrored. */
export const get = query({
  args: { id: v.string() },
  returns: v.union(vProduct, v.null()),
  handler: (ctx, { id }) => getProduct(ctx, id)
});

/** The mirrored products, archived ones only when asked for. */
export const list = query({
  args: { includeArchived: v.optional(v.boolean()) },
  returns: v.array(vProduct),
  handler: async (ctx, { includeArchived }) => {
    const rows = await ctx.db.query("polarProducts").take(MAX_PRODUCTS);
    return rows.filter((row) => includeArchived || !row.isArchived).map(withoutSystemFields);
  }
});

/** Mirrors products Polar returned, unless the mirror has a newer state. */
export const upsert = mutation({
  args: { products: v.array(vProduct) },
  returns: v.null(),
  handler: async (ctx, { products }) => {
    for (const product of products) await upsertProduct(ctx, product);
    return null;
  }
});

export async function getProduct(ctx: QueryCtx, id: string): Promise<Product | null> {
  const row = await ctx.db
    .query("polarProducts")
    .withIndex("by_polarId", (q) => q.eq("id", id))
    .unique();
  return row ? withoutSystemFields(row) : null;
}

export async function upsertProduct(ctx: MutationCtx, product: Product): Promise<void> {
  const existing = await ctx.db
    .query("polarProducts")
    .withIndex("by_polarId", (q) => q.eq("id", product.id))
    .unique();
  if (!existing) {
    await ctx.db.insert("polarProducts", product);
  } else if (changedAt(existing) <= changedAt(product)) {
    await ctx.db.replace("polarProducts", existing._id, product);
  }
}

function changedAt(product: Product): number {
  return product.modifiedAt ?? product.createdAt;
}
