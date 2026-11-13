/// <reference types="vite/client" />
import type { TestConvex } from "convex-test";
import type { GenericSchema, SchemaDefinition } from "convex/server";
import type { ComponentApi } from "./component/_generated/component.js";
import schema from "./component/schema.js";

const modules = import.meta.glob("./component/**/*.ts");

/**
 * Registers the component with a convex-test instance.
 * @param t - The test instance, e.g. from `convexTest(schema, modules)`.
 * @param name - The component's name in convex.config.ts.
 */
export function register<Schema extends SchemaDefinition<GenericSchema, boolean>>(
  t: TestConvex<Schema>,
  name: string = "polar"
): ComponentApi {
  return t.registerComponent(name, schema, modules) as unknown as ComponentApi;
}

export default { register, schema, modules };
