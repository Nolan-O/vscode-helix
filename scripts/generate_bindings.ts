/*
	Generate the list of bindings for keybindings in package.json
	run the file, then replace the keybindings array in package.json
*/

import { sanitizeCharForContext } from "../src/sanitize_context_char";

{
	const keys = [
		"a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m", "n", "o", "p", "q", "r", "s", "t", "u", "v", "w", "x", "y", "z",
		"pageup", "pagedown", "home", "end", "escape", "backspace",
		"[", "]", "`", ";", "'", ",", ".", "/", "\\\\", "=",
		"1", "2", "3", "4", "5", "6", "7", "8", "9", "0",
	];
	// special keys which don't get sent to type handlers and therefore always need to be bound
	const superkeys = [
		"escape", "backspace"
	]

	// Doesn't incude shift as a single combo
	// Make sure that each sub array is sorted by ctrl < shift < alt
	const modifier_combos = [
		["ctrl"], ["alt"], ["shift"], ["ctrl", "alt"], ["ctrl", "shift"], ["shift", "alt"], ["ctrl", "shift", "alt"],
	]

	const modifier_codes = {
		ctrl: "C",
		shift: "S",
		alt: "A"
	}

	let out = ""
	for (const key of superkeys) {
		out += `{ "key": "${key}", "command": "extension.helixKeymap.${key}", "when": "editorTextFocus"},`
	}

	for (let i = 0; i < modifier_combos.length; i++) {
		const modifiers = modifier_combos[i];
		const binding_prefix = modifiers.join("+");
		const command_prefix = modifiers.join("_");
		let internal_state_var_prefix = ""
		modifiers.map((v) => {
			internal_state_var_prefix += modifier_codes[v]
		})

		for (let j = 0; j < keys.length; j++) {
			const char = sanitizeCharForContext(keys[j])
			const internal_state_var = internal_state_var_prefix + char
			let entry = `{"key": "${binding_prefix}+${char}", "command": "extension.helixKeymap.${command_prefix}_${char}", "when": "editorTextFocus && ${internal_state_var}"},`
			out += entry
		}
	}

	console.log(out)
}