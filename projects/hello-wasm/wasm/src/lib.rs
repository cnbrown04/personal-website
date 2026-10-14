use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn greet(name: &str) -> String {
    format!("Hello, {name}, from Rust!")
}

/// Counts primes below `limit` with a sieve, to show off WASM speed.
#[wasm_bindgen]
pub fn count_primes(limit: u32) -> u32 {
    let n = limit as usize;
    if n < 2 {
        return 0;
    }
    let mut sieve = vec![true; n];
    sieve[0] = false;
    sieve[1] = false;
    let mut i = 2;
    while i * i < n {
        if sieve[i] {
            sieve[i * i..]
                .iter_mut()
                .step_by(i)
                .for_each(|x| *x = false);
        }
        i += 1;
    }
    sieve.iter().filter(|&&p| p).count() as u32
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn primes() {
        assert_eq!(count_primes(10), 4);
        assert_eq!(count_primes(1_000_000), 78_498);
    }
}
