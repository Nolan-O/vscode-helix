/*
  Generate the list of bindings for keybindings in package.json
  run the file, then replace the keybindings array in package.json
*/

import * as inputTools from "../src/input_utils";

{
  const keys = inputTools.keys

  let out = ""
  for (const key of inputTools.superkeys) {
    out += `{ "key": "${key}", "command": "extension.helixKeymap.${key}", "when": "editorTextFocus"},`
  }

  for (let i = 0; i < inputTools.modifierCombos.length; i++) {
    const modifiers = inputTools.modifierCombos[i];
    const binding_prefix = modifiers.join("+");
    const command_prefix = modifiers.join("_");
    let internal_state_var_prefix = ""
    modifiers.map((v) => {
      internal_state_var_prefix += inputTools.modifierCodes[v]
    })

    for (let j = 0; j < keys.length; j++) {
      const char = inputTools.sanitizeCharForContext(keys[j])
      /*       if (modifiers.length === 1 && modifiers[0] === "shift" && inputTools.isSymbolKey(char)) {
              continue
            } */

      const internal_state_var = internal_state_var_prefix + char
      let entry = `{"key": "${binding_prefix}+${char}", "command": "extension.helixKeymap.${command_prefix}_${char}", "when": "editorTextFocus && ${internal_state_var}"},`
      out += entry
    }
  }

  console.log(out)
}