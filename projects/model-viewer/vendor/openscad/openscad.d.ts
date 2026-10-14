// Types for the official OpenSCAD WebAssembly build (Emscripten ES module).
export interface OpenSCADInstance {
  callMain(args: string[]): number;
  FS: {
    mkdir(path: string): void;
    writeFile(path: string, data: string | Uint8Array): void;
    readFile(path: string): Uint8Array;
  };
}

export interface OpenSCADOptions {
  noInitialRun?: boolean;
  print?: (text: string) => void;
  printErr?: (text: string) => void;
  instantiateWasm?: (
    imports: WebAssembly.Imports,
    done: (instance: WebAssembly.Instance, module: WebAssembly.Module) => void,
  ) => object;
}

export default function OpenSCAD(options?: OpenSCADOptions): Promise<OpenSCADInstance>;
