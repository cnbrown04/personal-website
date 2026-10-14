use wasm_bindgen::prelude::*;

// Built to ./pkg by `mise run build:wasm`. Import from JS with:
//   import init, { add } from "../wasm/pkg/{{crate}}.js";
//   await init();
#[wasm_bindgen]
pub fn add(a: i32, b: i32) -> i32 {
    a + b
}
