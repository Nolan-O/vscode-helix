/*
	Generates a list of function calls to create commands for index.ts
	The commands correspond to the keybindings we also generate in generate_bindings.ts
*/
{
	const keys = [
		"a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m", "n", "o", "p", "q", "r", "s", "t", "u", "v", "w", "x", "y", "z",
		"pageup", "pagedown", "home", "end", "escape", "backspace",
		"[", "]", "`", ";", "'", ",", ".", "/", "\\\\", "=", "-",
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

	let out = ""
	for (const key of superkeys) {
		out += `commands.registerCommand("extension.helixKeymap.${key}", () => { globalhelixState.typeSubscription(globalhelixState, "${key}"); }),\n`
	}

	for (let i = 0; i < modifier_combos.length; i++) {
		const modifiers = modifier_combos[i];
		const command_prefix = "extension.helixKeymap." + modifiers.join("_");
		let pushed_strs = ""
		modifiers.map((v, i) => {
			pushed_strs += `"${v}"`
			if (i < modifiers.length - 1) {
				pushed_strs += ", "
			}
		})

		for (let j = 0; j < keys.length; j++) {
			let entry = `commands.registerCommand("${command_prefix}_${keys[j]}", () => { pushKP([${pushed_strs}]); globalhelixState.typeSubscription(globalhelixState, "${keys[j]}"); }),\n`
			out += entry
		}
	}
	console.log(out)
}