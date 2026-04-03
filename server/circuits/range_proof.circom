pragma circom 2.1.5;

include "../node_modules/circomlib/circuits/bitify.circom";
include "../node_modules/circomlib/circuits/comparators.circom";

// RangeProof: Proves that `in` is within [0, maxValue] 
// where maxValue = 2^n - 1
// n = number of bits (32 bits supports values up to ~4.29 billion)
template RangeProof(n) {
    signal input in;         // The emission value to prove
    signal input maxValue;   // The upper bound

    // 1. Prove `in` fits in n bits (implicitly proves in >= 0)
    component bits = Num2Bits(n);
    bits.in <== in;

    // 2. Prove in <= maxValue using LessThan
    component lt = LessEqThan(n);
    lt.in[0] <== in;
    lt.in[1] <== maxValue;
    lt.out === 1;
}

component main {public [maxValue]} = RangeProof(32);
