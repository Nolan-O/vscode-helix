const dirty_strings = {
  // Turns out this is the only one?
  // LSP says = and ' should be issues but they aren't
  ["`"]: "backtick"
}

export const keys = [
  "a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m", "n", "o", "p", "q", "r", "s", "t", "u", "v", "w", "x", "y", "z",
  "pageup", "pagedown", "home", "end", "escape", "backspace",
  "[", "]", "`", ";", "'", ",", ".", "/", "\\\\", "=",
  "1", "2", "3", "4", "5", "6", "7", "8", "9", "0",
];

export const symbols = [
  "[", "]", "`", ";", "'", ",", ".", "/", "\\\\", "="
]

export const shiftedSymbols = {
  ["["]: "{",
  ["]"]: "}",
  ["`"]: "~",
  [";"]: ":",
  ["'"]: "\"",
  [","]: "<",
  ["."]: ">",
  ["/"]: "?",
  ["\\\\"]: "|",
  ["="]: "+"
}

// special keys which don't get sent to type handlers and therefore always need to be bound
export const superkeys = [
  "escape", "backspace"
]

// Doesn't incude shift as a single combo
// Make sure that each sub array is sorted by ctrl < shift < alt
export const modifierCombos = [
  ["ctrl"], ["alt"], ["shift"], ["ctrl", "alt"], ["ctrl", "shift"], ["shift", "alt"], ["ctrl", "shift", "alt"],
]

export const modifierCodes = {
  ctrl: "C",
  shift: "S",
  alt: "A"
}

export function isSymbolKey(str: string) {
  return symbols.includes(str)
}

export function sanitizeCharForContext(str: string): string {
  if (dirty_strings[str] != undefined) {
    return dirty_strings[str]
  }

  return str
}

export function isModifier(str: string) {
  return str === "shift" || str === "ctrl" || str === "alt"
}

// returns a chord with shift keys applied
// strips keys with non-shift modifiers
export function literalizeChord(chord: string[]): string[] {
  let ret = []
  for (let i = 0; i < chord.length; i++) {
    const char = chord[i]
    if (isModifier(char) === false) {
      if (isModifier(chord[i - 2]) === false) {
        if (chord[i - 1] === "shift") {
          if (isSymbolKey(char)) {
            ret.push(shiftedSymbols[char])
          } else {
            ret.push(char.toUpperCase())
          }
        } else if (isModifier(chord[i - 1]) === false) {
          ret.push(char)
        }
      }
    }
  }

  return ret
}

export function getMatchPairs(char: string) {
  let startChar: string;
  let endChar: string;
  if (['{', '}'].includes(char)) {
    startChar = '{';
    endChar = '}';
  } else if (['[', ']'].includes(char)) {
    startChar = '[';
    endChar = ']';
  } else if (['(', ')'].includes(char)) {
    startChar = '(';
    endChar = ')';
  } else if (['<', '>'].includes(char)) {
    startChar = '<';
    endChar = '>';
  } else {
    // Otherwise, startChar and endChar should be the same character
    startChar = char;
    endChar = char;
  }

  return [startChar, endChar];
};