export type ParamKind = "bool" | "number" | "string" | "vector";

export type ParamValue = boolean | number | string | (number | string | boolean)[];

export interface ParamOption {
  value: ParamValue;
  label: string;
}

export interface Param {
  name: string;
  group: string;
  kind: ParamKind;
  default: ParamValue;
  description?: string;
  min?: number;
  max?: number;
  step?: number;
  max_length?: number;
  options?: ParamOption[];
  hidden: boolean;
  line: number;
}

export interface Group {
  name: string;
  description?: string;
  hidden: boolean;
}

export interface Schema {
  file: string;
  source_hash: string;
  openscad_version: string;
  groups: Group[];
  params: Param[];
  includes?: string[];
}

export type Params = Record<string, ParamValue>;

export interface Preset {
  name: string;
  params: Params;
  description?: string;
  builtin?: boolean;
  /** unix seconds */
  updated?: number;
  /** hidden from the list (per-browser preference) */
  hidden?: boolean;
}

export interface RenderStats {
  renderMs: number;
  triangles: number;
  vertices: number;
  cached: boolean;
  log: string;
  volume: number;
  area: number;
  size: [number, number, number];
  decodeMs: number;
  /** time to build three.js geometry for the new mesh */
  displayMs: number;
  /** per-part render ms, or "cached" */
  parts: Record<string, number | "cached">;
}
