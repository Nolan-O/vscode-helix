const dirty_strings: { [key: string]: string | undefined } = {
  ["`"]: "backtick",
  ["'"]: "squote",
  ["="]: "eq",
  ["\\"]: "bslash"
}

export const keys = [
  "a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m", "n", "o", "p", "q", "r", "s", "t", "u", "v", "w", "x", "y", "z",
  "pageup", "pagedown", "home", "end", "escape", "backspace", "left", "right", "up", "down",
  "[", "]", "`", ";", "'", ",", ".", "/", "\\", "=", "-",
  "1", "2", "3", "4", "5", "6", "7", "8", "9", "0",
];

export const symbols = [
  "[", "]", "`", ";", "'", ",", ".", "/", "\\", "=", "-"
]

export const shiftedSymbols: { [key: string]: string | undefined } = {
  ["["]: "{",
  ["]"]: "}",
  ["`"]: "~",
  [";"]: ":",
  ["'"]: "\"",
  [","]: "<",
  ["."]: ">",
  ["/"]: "?",
  ["\\"]: "|",
  ["="]: "+",
  ["-"]: "_",
}

export const unshiftedSymbols: { [key: string]: string | undefined } = {
  ["{"]: "[",
  ["}"]: "]",
  ["~"]: "`",
  [":"]: ";",
  ["\""]: "'",
  ["<"]: ",",
  [">"]: ".",
  ["?"]: "/",
  ["|"]: "\\",
  ["+"]: "=",
  ["_"]: "-",
}

// special keys which don't get sent to type handlers and therefore always need to be bound
export const superkeys = [
  "pageup", "pagedown", "home", "end", "escape", "backspace", "left", "right", "up", "down"
]

export const superkeysObj: { [key: string]: boolean | undefined } = {
  pageup: true,
  pagedown: true,
  home: true,
  end: true,
  escape: true,
  backspace: true,
  left: true,
  right: true,
  up: true,
  down: true
}

// Doesn't incude shift as a single combo
// Make sure that each sub array is sorted by ctrl < shift < alt
export const modifierCombos = [
  ["ctrl"], ["alt"], ["shift"], ["ctrl", "alt"], ["ctrl", "shift"], ["shift", "alt"], ["ctrl", "shift", "alt"],
]

export const modifierCodes: { [key: string]: string | undefined } = {
  ctrl: "C",
  shift: "S",
  alt: "A"
}

export const reverseModifierCodes: { [key: string]: string | undefined } = {
  C: "ctrl",
  S: "shift",
  A: "alt"
}

export function isSymbolKey(str: string) {
  return symbols.includes(str)
}

export function sanitizeCharForContext(str: string): string {
  if (dirty_strings[str] !== undefined) {
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
    if (superkeysObj[char] !== undefined) {
      continue
    }

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

export const escapes: { [key: string]: string | undefined } = {
  ["\\"]: "\\\\"
}

export function escapeLiteral(str: string) {
  return escapes[str] ? escapes[str] : str
}

export function unescape(str: string) {
  if (str === "\\")
    return "\\"
  else
    return str
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

let modifierOrder: { [key: string]: number } = {
  ctrl: 1,
  shift: 2,
  alt: 3
}

let modifierCode: { [key: string]: string } = {
  ctrl: "C",
  shift: "S",
  alt: "A"
}

/*
  We we have to sort modifiers because:
  The conditional keybindings in package.json should only rely on one internal variable, ideally
  which means every combination of modifier orders should end up as one unique string followed by
  the terminating character.
 
  Helix's config allows modifiers in any order, so we must as well, which we'd want to anyway because it's nice
 */
export function sortModifiers(keys: string[]) {
  let has_modifiers = false

  // keys.sort won't work because we have unique requirements: the sorted area terminates when we find a non-modifier
  //  a naive sort algorithm seems fine in this case: creating new arrays and then rejoining them seems extra wasteful
  //  plus the longest chord we could realistically expect should be *maybe* a few dozen for the most insane use cases
  // The most rational reason to have a dozen keys in a chord is (ctrl + alt + shift + <key>) x3
  while (true) {
    let shifted = false

    for (let i = 0; i < keys.length - 1; i++) {
      const lhs = modifierOrder[keys[i]]
      const rhs = modifierOrder[keys[i + 1]]

      if (lhs != undefined || rhs != undefined) {
        has_modifiers = true
      }

      if (lhs === undefined || rhs === undefined) {
        continue
      }

      if (lhs != undefined && rhs != undefined) {
        if (lhs - rhs > 0) {
          shifted = true
          const intermediate = keys[i]
          keys[i] = keys[i + 1]
          keys[i + 1] = intermediate
        }
      }
    }

    if (shifted === false) {
      break;
    }
  }

  return has_modifiers
}

// Sort your modifier keys before using this
export function getBindingContextStr(keys: string[]) {
  let strs = []
  for (let i = 0; i < keys.length; i++) {
    const v = keys[i]
    let code: string | undefined = modifierCode[v]

    if (code != undefined) {
      let str = ""

      let j = 0
      for (let k = i + 1; code != undefined; k++) {
        j += 1
        str += code
        code = modifierCode[keys[k]]
      }

      i += j

      // A final concat to add the key which followed the modifier sequence
      str += sanitizeCharForContext(keys[i])
      strs.push(str)
    }
  }

  return strs
}