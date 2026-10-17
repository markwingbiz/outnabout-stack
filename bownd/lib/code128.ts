// bownd/lib/code128.ts
// Pure Code 128-B encoder (ISO/IEC 15417). No dependencies, no DOM.
//
// Why hand-rolled: the usual RN barcode package (react-native-barcode-builder)
// depends on @react-native-community/art, which is unmaintained and broken on
// modern React Native — so we encode here and render with react-native-svg
// (already a dependency). The width table below is the standard Code 128
// symbol table (values 0-106); each entry is the six alternating bar/space
// widths for that symbol, starting with a bar. The stop symbol (106) gets a
// final 2-module bar, making the 13-module stop pattern.
//
// Verification: encodeCode128BToBinary() output was compared module-for-module
// against python-barcode's Code128 output for several test strings (see the
// verification notes in the patch description). Checksum: start value 104 at
// weight 1, each data symbol weighted by its 1-based position, mod 103.
export type Code128Run = {
  /** true = black bar, false = white space. */
  black: boolean;
  /** Width in modules. */
  modules: number;
};

// Symbol values 0-106. Index = symbol value. Each string is the six
// bar/space widths (bar, space, bar, space, bar, space).
const WIDTHS: string[] = [
  "212222", // 0
  "222122", // 1
  "222221", // 2
  "121223", // 3
  "121322", // 4
  "131222", // 5
  "122213", // 6
  "122312", // 7
  "132212", // 8
  "221213", // 9
  "221312", // 10
  "231212", // 11
  "112232", // 12
  "122132", // 13
  "122231", // 14
  "113222", // 15
  "123122", // 16
  "123221", // 17
  "223211", // 18
  "221132", // 19
  "221231", // 20
  "213212", // 21
  "223112", // 22
  "312131", // 23
  "311222", // 24
  "321122", // 25
  "321221", // 26
  "312212", // 27
  "322112", // 28
  "322211", // 29
  "212123", // 30
  "212321", // 31
  "232121", // 32
  "111323", // 33
  "131123", // 34
  "131321", // 35
  "112313", // 36
  "132113", // 37
  "132311", // 38
  "211313", // 39
  "231113", // 40
  "231311", // 41
  "112133", // 42
  "112331", // 43
  "132131", // 44
  "113123", // 45
  "113321", // 46
  "133121", // 47
  "313121", // 48
  "211331", // 49
  "231131", // 50
  "213113", // 51
  "213311", // 52
  "213131", // 53
  "311123", // 54
  "311321", // 55
  "331121", // 56
  "312113", // 57
  "312311", // 58
  "332111", // 59
  "314111", // 60
  "221411", // 61
  "431111", // 62
  "111224", // 63
  "111422", // 64
  "121124", // 65
  "121421", // 66
  "141122", // 67
  "141221", // 68
  "112214", // 69
  "112412", // 70
  "122114", // 71
  "122411", // 72
  "142112", // 73
  "142211", // 74
  "241211", // 75
  "221114", // 76
  "413111", // 77
  "241112", // 78
  "134111", // 79
  "111242", // 80
  "121142", // 81
  "121241", // 82
  "114212", // 83
  "124112", // 84
  "124211", // 85
  "411212", // 86
  "421112", // 87
  "421211", // 88
  "212141", // 89
  "214121", // 90
  "412121", // 91
  "111143", // 92
  "111341", // 93
  "131141", // 94
  "114113", // 95
  "114311", // 96
  "411113", // 97
  "411311", // 98
  "113141", // 99
  "114131", // 100
  "311141", // 101
  "411131", // 102
  "211412", // 103 Start A
  "211214", // 104 Start B
  "211232", // 105 Start C
  "233111", // 106 Stop (final 2-module bar appended by the encoder)
];

const START_B = 104;
const STOP = 106;
const STOP_FINAL_BAR_MODULES = 2;

/** Code 128-B covers ASCII 32 (space) through 127 (DEL). */
export function isEncodableCode128B(value: string): boolean {
  if (!value) return false;
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code < 32 || code > 127) return false;
  }
  return true;
}

/**
 * Encode a string as Code 128-B. Returns the bar/space runs (no quiet zone;
 * callers add the mandatory 10-module quiet zone on each side when rendering).
 * Throws on empty input or characters outside Code 128-B (ASCII 32-127).
 */
export function encodeCode128B(value: string): Code128Run[] {
  if (!isEncodableCode128B(value)) {
    throw new Error("Code128-B can only encode non-empty ASCII 32-127 strings.");
  }
  // Data symbol values: ASCII code minus 32.
  const dataValues: number[] = [];
  for (let i = 0; i < value.length; i += 1) {
    dataValues.push(value.charCodeAt(i) - 32);
  }
  // Checksum: start value at weight 1, each data symbol at its 1-based
  // position weight, sum mod 103.
  let checksum = START_B;
  for (let i = 0; i < dataValues.length; i += 1) {
    checksum += (i + 1) * dataValues[i];
  }
  checksum %= 103;

  const symbols = [START_B, ...dataValues, checksum, STOP];
  const runs: Code128Run[] = [];
  for (const symbol of symbols) {
    const widths = WIDTHS[symbol];
    for (let i = 0; i < widths.length; i += 1) {
      runs.push({ black: i % 2 === 0, modules: Number(widths[i]) });
    }
    if (symbol === STOP) {
      // Final 2-module bar of the stop pattern.
      runs.push({ black: true, modules: STOP_FINAL_BAR_MODULES });
    }
  }
  return runs;
}

/** Binary string of 1s (bar) and 0s (space), one char per module. Useful for tests. */
export function encodeCode128BToBinary(value: string): string {
  const runs = encodeCode128B(value);
  let out = "";
  for (const run of runs) {
    out += (run.black ? "1" : "0").repeat(run.modules);
  }
  return out;
}
