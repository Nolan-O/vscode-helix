/*
  Generates a list of function calls to create commands for index.ts
  The commands correspond to the keybindings we also generate in generate_bindings.ts
*/
import * as inputTools from "../src/input_utils";

{
  const keys = inputTools.keys;

  let out = ""
  for (const key of inputTools.superkeys) {
    out += `commands.registerCommand("extension.helixKeymap.${key}", () => { globalhelixState.typeSubscription(globalhelixState, "${key}"); }),\n`
  }

  for (let i = 0; i < inputTools.modifierCombos.length; i++) {
    const modifiers = inputTools.modifierCombos[i];
    const command_prefix = "extension.helixKeymap." + modifiers.join("_");

    let pushed_strs = ""
    modifiers.map((v, i) => {
      pushed_strs += `"${v}"`
      if (i < modifiers.length - 1) {
        pushed_strs += ", "
      }
    })

    for (let j = 0; j < keys.length; j++) {
      const key = keys[j]
      /*       if (modifiers.length === 1 && modifiers[0] === "shift" && inputTools.isSymbolKey(key)) {
              continue
            } */

      let entry = `commands.registerCommand("${command_prefix}_${key}", () => { pushKP([${pushed_strs}]); globalhelixState.typeSubscription(globalhelixState, "${key}"); }),\n`
      out += entry
    }
  }
  console.log(out)
}