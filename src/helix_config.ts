import * as vscode from 'vscode';
import * as toml from 'smol-toml';
import * as json5 from 'json5';
import { actions2, actionFuncs } from './actions/actions';
import { Action2, BindingActionList, BindingLayer } from './action_types'
import { sanitizeCharForContext } from './sanitize_context_char';
import { Mode } from './modes_types';

type VSKeyBinding = {
	key: string,
	when: string,
	command: string
}
type VSKeyBindings = [VSKeyBinding]

async function open_file(windows_uri: vscode.Uri, other_uri: vscode.Uri): Promise<string> {
	return new Promise((resolve, reject) => {
		vscode.workspace.fs.readFile(windows_uri).then((bytes) => {
			resolve(bytes.toString());
		}).catch(() => {
			vscode.workspace.fs.readFile(other_uri).then((bytes) => {
				resolve(bytes.toString());
			}).catch(() => {
				reject()
			})
		})
	})
}

export async function getHelixConfig() {
	// os.homedir() returns "home" for some reason
	// os.userInfo is not available for some reason
	// But it seems process.env['HOMEPATH'] works
	let windows_uri = vscode.Uri.file(process.env['HOMEPATH'] + "\\AppData\\Roaming\\helix\\config.toml")
	// TODO: Test this env var is also set on linux
	let other_uri = vscode.Uri.file(process.env['HOMEPATH'] + "/.config/helix/config.toml")

	let file = null;
	await open_file(windows_uri, other_uri).then((str) => {
		file = str;
	}).catch(() => { })

	if (file == null) {
		return;
	}

	console.log(toml.parse(file))
	return toml.parse(file);
}

export async function getVSConfig() {
	let windows_uri = vscode.Uri.file(process.env['HOMEPATH'] + "\\AppData\\Roaming\\Code\\User\\keybindings.json")
	let other_uri = vscode.Uri.file(process.env['HOMEPATH'] + "/.config/Code/User/keybindings.json")

	let file = null;
	await open_file(windows_uri, other_uri).then((str) => {
		file = str;
	}).catch(() => { })

	if (file == null) {
		return;
	}

	console.log(json5.parse(file))
	return json5.parse(file);
}

export async function dostuff() {
	getHelixConfig();
	getVSConfig();
}

function configError(mode: Mode, cur_idx: number, keys: string[]) {
	let seq = ""
	let seq_so_far = ""
	keys.map(e => { seq += e })
	keys.map((v, i) => { if (i < cur_idx) seq_so_far += v })
	console.warn(`Error adding config item: Mode ${mode.toString()}, key sequence ${seq_so_far} is already bound to some actions; cannot index it further with ${seq}`)
}

function isModifier(str: string) {
	return str === "shift" || str === "ctrl" || str == "alt"
}
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
function sortModifiers(keys: string[]) {
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
function getModifierBindings(keys: string[]) {
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

function resetBindings() {
	for (let key of Object.values(Mode)) {
		actions2[key] = {};
	}
}

export function addBinding(actions: Action2[], cfg: BindingActionList[]) {
	for (const [mode, keys] of cfg) {
		let has_modifiers = sortModifiers(keys)
		if (has_modifiers === true) {
			let binding_strs = getModifierBindings(keys)
			// TODO: the vim extension uses an async wrapper around this because of latency, probably a good idea
			for (let str of binding_strs) {
				vscode.commands.executeCommand('setContext', str, true);
			}
		}

		let existing: Action2[] | BindingLayer = actions2[mode]

		keys.forEach((key, idx) => {
			if (idx < keys.length - 1) {
				if (Array.isArray(existing)) {
					configError(mode, idx, keys)
					return false
				} else {
					existing[key] = existing[key] ? existing[key] : {}
					existing = existing[key]
				}
			} else {
				if (Array.isArray(existing)) {
					configError(mode, idx, keys)
					return false
				} else {
					existing[key] = actions
				}
			}
		})
	}

	return true
}

export function loadDefaultConfig() {
	resetBindings()
	/*
		Unknown/custom
	*/
	// Occurence mode isn't even accessible
	addBinding([actionFuncs.addSelectionToPreviousFindMatch], [[Mode.Occurrence, ["p"]]])
	addBinding([actionFuncs.selectHighlights], [[Mode.Occurrence, ["a"]]])
	addBinding([actionFuncs.window_mode], [[Mode.Normal, ["ctrl", "w"]]])
	addBinding([actionFuncs.view_mode], [[Mode.Normal, ["shift", "z"]]])
	addBinding([actionFuncs.gotoPageUp], [[Mode.Normal, ["g", "pgup"]], [Mode.Visual, ["g", "pgup"]]])
	addBinding([actionFuncs.gotoPageDown], [[Mode.Normal, ["g", "pgdn"]], [Mode.Visual, ["g", "pgdn"]]])

	addBinding([actionFuncs.backspaceOverride], [[Mode.Insert, ["backspace"]]])
	addBinding([actionFuncs.searchBackspaceOverride], [[Mode.SearchInProgress, ["backspace"]]])

	/*
		Basic
	*/
	addBinding([actionFuncs.normal_mode], [
		[Mode.Insert, ["escape"]],
		[Mode.Normal, ["escape"]],
		[Mode.SearchInProgress, ["escape"]],
		[Mode.Select, ["escape"]],
		[Mode.Window, ["escape"]],
		[Mode.Visual, ["escape"]],
		[Mode.VisualLine, ["escape"]],
		[Mode.View, ["escape"]],
		[Mode.Match, ["escape"]]
	])
	addBinding([actionFuncs.search_next], [[Mode.Normal, ["n"]]])
	addBinding([actionFuncs.yank], [[Mode.Normal, ["y"]], [Mode.Visual, ["y"]]])
	addBinding([actionFuncs.search_prev], [[Mode.Normal, ["shift", "n"]]])
	addBinding([actionFuncs.search_selection], [[Mode.Normal, ["*"]]])
	addBinding([actionFuncs.insert_mode], [[Mode.Normal, ["i"]], [Mode.Visual, ["i"]], [Mode.VisualLine, ["i"]], [Mode.Occurrence, ["i"]]])
	addBinding([actionFuncs.append_mode], [[Mode.Normal, ["a"]], [Mode.Visual, ["a"]], [Mode.VisualLine, ["a"]], [Mode.Occurrence, ["a"]]])
	addBinding([actionFuncs.insert_at_line_start], [[Mode.Normal, ["shift", "i"]]])
	addBinding([actionFuncs.insert_at_line_end], [[Mode.Normal, ["shift", "a"]]])
	addBinding([actionFuncs.search], [[Mode.Normal, ["/"]]])
	addBinding([actionFuncs.rsearch], [[Mode.Normal, ["?"]]])
	addBinding([actionFuncs.select_regex], [[Mode.Normal, ["s"]], [Mode.Visual, ["s"]]])
	addBinding([actionFuncs.keep_primary_selection], [[Mode.Normal, [","]], [Mode.Visual, [","]]])
	addBinding([actionFuncs.indent], [[Mode.Normal, [">"]], [Mode.Visual, [">"]]])
	addBinding([actionFuncs.unindent], [[Mode.Normal, ["<"]], [Mode.Visual, ["<"]]])
	addBinding([actionFuncs.format_selections], [[Mode.Normal, ["="]], [Mode.Visual, ["="]]])
	addBinding([actionFuncs.switch_to_lowercase], [[Mode.Normal, ["`"]]])
	addBinding([actionFuncs.switch_to_uppercase], [[Mode.Normal, ["alt", "`"]]])
	addBinding([actionFuncs.switch_case], [[Mode.Normal, ["~"]]])
	addBinding([actionFuncs.select_mode], [[Mode.Normal, ["v"]]])
	addBinding([actionFuncs.open_below], [[Mode.Normal, ["o"]], [Mode.Visual, ["o"]], [Mode.VisualLine, ["o"]]])
	addBinding([actionFuncs.open_below], [[Mode.Normal, ["shift", "o"]], [Mode.Visual, ["shift", "o"]], [Mode.VisualLine, ["shift", "o"]]])
	addBinding([actionFuncs.paste_after], [[Mode.Normal, ["p"]], [Mode.Visual, ["p"]], [Mode.VisualLine, ["p"]]])
	addBinding([actionFuncs.paste_before], [[Mode.Normal, ["shift", "p"]], [Mode.Visual, ["shift", "p"]]])
	addBinding([actionFuncs.undo], [[Mode.Normal, ["u"]], [Mode.Visual, ["u"]], [Mode.VisualLine, ["u"]]])
	addBinding([actionFuncs.redo], [[Mode.Normal, ["shift", "u"]], [Mode.Visual, ["shift", "u"]], [Mode.VisualLine, ["shift", "u"]]])
	addBinding([actionFuncs.extend_line_below], [[Mode.Normal, ["x"]]])
	addBinding([actionFuncs.collapse_selection], [[Mode.Normal, [";"]]])

	/*
		Motions
	*/
	addBinding([actionFuncs.move_char_right], [[Mode.Normal, ["l"]], [Mode.Visual, ["l"]]])
	addBinding([actionFuncs.move_char_left], [[Mode.Normal, ["h"]], [Mode.Visual, ["h"]]])
	addBinding([actionFuncs.move_visual_line_up], [[Mode.Normal, ["k"]], [Mode.Visual, ["k"]], [Mode.VisualLine, ["k"]]])
	addBinding([actionFuncs.move_visual_line_down], [[Mode.Normal, ["j"]], [Mode.Visual, ["j"]], [Mode.VisualLine, ["j"]]])
	addBinding([actionFuncs.move_next_word_start], [[Mode.Normal, ["w"]], [Mode.Visual, ["w"]], [Mode.VisualLine, ["w"]]])
	addBinding([actionFuncs.move_next_long_word_start], [[Mode.Normal, ["shift", "w"]], [Mode.Visual, ["shift", "w"]], [Mode.VisualLine, ["shift", "w"]]])
	addBinding([actionFuncs.move_prev_word_start], [[Mode.Normal, ["b"]], [Mode.Visual, ["b"]], [Mode.VisualLine, ["b"]]])
	addBinding([actionFuncs.move_prev_long_word_start], [[Mode.Normal, ["shift", "b"]], [Mode.Visual, ["shift", "b"]], [Mode.VisualLine, ["shift", "b"]]])
	addBinding([actionFuncs.move_next_word_end], [[Mode.Normal, ["e"]], [Mode.Visual, ["e"]], [Mode.VisualLine, ["e"]]])
	addBinding([actionFuncs.move_next_long_word_end], [[Mode.Normal, ["shift", "e"]], [Mode.Visual, ["shift", "e"]], [Mode.VisualLine, ["shift", "e"]]])

	/*
		Goto actions
	*/
	addBinding([actionFuncs.goto_last_modification], [[Mode.Normal, ["g", "."]]])
	addBinding([actionFuncs.goto_file_start], [[Mode.Normal, ["g", "g"]], [Mode.Visual, ["g", "g"]]])
	addBinding([actionFuncs.goto_last_line], [[Mode.Normal, ["g", "e"]], [Mode.Visual, ["g", "e"]]])
	addBinding([actionFuncs.goto_line_start], [[Mode.Normal, ["g", "h"]], [Mode.Visual, ["g", "h"]]])
	addBinding([actionFuncs.goto_line_end], [[Mode.Normal, ["g", "l"]], [Mode.Visual, ["g", "l"]]])
	addBinding([actionFuncs.goto_first_nonwhitespace], [[Mode.Normal, ["g", "s"]], [Mode.Visual, ["g", "s"]]])
	addBinding([actionFuncs.goto_definition], [[Mode.Normal, ["g", "d"]]])
	addBinding([actionFuncs.goto_type_definition], [[Mode.Normal, ["g", "y"]]])
	addBinding([actionFuncs.goto_reference], [[Mode.Normal, ["g", "r"]]])
	addBinding([actionFuncs.goto_window_top], [[Mode.Normal, ["g", "t"]], [Mode.Visual, ["g", "t"]], [Mode.VisualLine, ["g", "t"]]])
	addBinding([actionFuncs.goto_window_center], [[Mode.Normal, ["g", "c"]], [Mode.Visual, ["g", "c"]], [Mode.VisualLine, ["g", "c"]]])
	addBinding([actionFuncs.goto_window_bottom], [[Mode.Normal, ["g", "b"]], [Mode.Visual, ["g", "b"]], [Mode.VisualLine, ["g", "b"]]])
	addBinding([actionFuncs.move_line_up], [[Mode.Normal, ["g", "k"]]])
	addBinding([actionFuncs.move_line_down], [[Mode.Normal, ["g", "j"]]])
	addBinding([actionFuncs.goto_last_accessed_file], [[Mode.Normal, ["g", "a"]]])
	addBinding([actionFuncs.goto_last_modified_file], [[Mode.Normal, ["g", "m"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["g", "n"]]])
	addBinding([actionFuncs.goto_previous_buffer], [[Mode.Normal, ["g", "p"]]])

	/*
		Space menu
	*/
	addBinding([actionFuncs.file_picker], [[Mode.Normal, [" ", "f"]]])
	addBinding([actionFuncs.debugView], [[Mode.Normal, [" ", "g"]]])
	addBinding([actionFuncs.hover], [[Mode.Normal, [" ", "k"]]])
	addBinding([actionFuncs.symbol_picker], [[Mode.Normal, [" ", "s"]]])
	addBinding([actionFuncs.workspace_symbol_picker], [[Mode.Normal, [" ", "shift", "s"]]])
	addBinding([actionFuncs.diagnostics_picker], [[Mode.Normal, [" ", "d"]]])
	addBinding([actionFuncs.workspace_diagnostics_picker], [[Mode.Normal, [" ", "shift", "d"]]])
	addBinding([actionFuncs.rename_symbol], [[Mode.Normal, [" ", "r"]]])
	addBinding([actionFuncs.code_action], [[Mode.Normal, [" ", "a"]]])
	addBinding([actionFuncs.window_mode], [[Mode.Normal, [" ", "w"]]])
	addBinding([actionFuncs.global_search], [[Mode.Normal, [" ", "/"]]])
	addBinding([actionFuncs.command_palette], [[Mode.Normal, [" ", "shift", "-"]]])

	/*
		View menu
	*/
	addBinding([actionFuncs.goto_window_center], [[Mode.View, ["c"]]])
	addBinding([actionFuncs.goto_window_center], [[Mode.View, ["m"]]])
	addBinding([actionFuncs.goto_window_top], [[Mode.View, ["t"]]])
	addBinding([actionFuncs.goto_window_bottom], [[Mode.View, ["b"]]])
	addBinding([actionFuncs.move_line_up], [[Mode.View, ["k"]]])
	addBinding([actionFuncs.move_line_down], [[Mode.View, ["j"]]])

	/*
		Brackets
	*/
	addBinding([actionFuncs.goto_next_diag], [[Mode.Normal, ["]", "d"]]])
	addBinding([actionFuncs.goto_prev_diag], [[Mode.Normal, ["[", "d"]]])
	addBinding([actionFuncs.goto_last_diag], [[Mode.Normal, ["]", "shift", "d"]]])
	addBinding([actionFuncs.goto_first_diag], [[Mode.Normal, ["[", "shift", "d"]]])
	addBinding([actionFuncs.goto_next_change], [[Mode.Normal, ["[", "g"]]])
	addBinding([actionFuncs.goto_prev_change], [[Mode.Normal, ["]", "g"]]])
	addBinding([actionFuncs.goto_next_function], [[Mode.Normal, ["[", "f"]]])
	addBinding([actionFuncs.goto_prev_function], [[Mode.Normal, ["]", "f"]]])
	addBinding([actionFuncs.goto_next_paragraph], [[Mode.Normal, ["]", "p"]], [Mode.Visual, ["]", "p"]], [Mode.VisualLine, ["]", "p"]]])
	addBinding([actionFuncs.goto_prev_paragraph], [[Mode.Normal, ["]", "p"]], [Mode.Visual, ["]", "p"]], [Mode.VisualLine, ["]", "p"]]])

	/*
		window actions
	*/
	// VSCode specific
	addBinding([actionFuncs.moveEditorRight], [[Mode.Window, ["m", "v"]]])
	addBinding([actionFuncs.moveEditorDown], [[Mode.Window, ["m", "s"]]])
	addBinding([actionFuncs.moveEditorLeft], [[Mode.Window, ["m", "p"]]])
	addBinding([actionFuncs.moveEditorNewWindow], [[Mode.Window, ["m", "w"]]])
	addBinding([actionFuncs.moveEditorMainWindow], [[Mode.Window, ["m", "j"]]])
	// Helix
	addBinding([actionFuncs.rotate_view], [[Mode.Window, ["w"]]])
	addBinding([actionFuncs.vsplit], [[Mode.Window, ["v"]]])
	addBinding([actionFuncs.hsplit], [[Mode.Window, ["s"]]])
	addBinding([actionFuncs.goto_file], [[Mode.Window, ["f"]]])
	addBinding([actionFuncs.goto_file], [[Mode.Window, ["shift", "f"]]])
	addBinding([actionFuncs.jump_view_left], [[Mode.Window, ["h"]]])
	addBinding([actionFuncs.jump_view_right], [[Mode.Window, ["l"]]])
	addBinding([actionFuncs.jump_view_down], [[Mode.Window, ["j"]]])
	addBinding([actionFuncs.jump_view_up], [[Mode.Window, ["k"]]])
	addBinding([actionFuncs.wclose], [[Mode.Window, ["q"]]])
	// For some reason, a vim alias
	addBinding([actionFuncs.wclose], [[Mode.Window, ["c"]]])
	addBinding([actionFuncs.wonly], [[Mode.Window, ["o"]]])
	addBinding([actionFuncs.swap_view_left], [[Mode.Window, ["shift", "h"]]])
	addBinding([actionFuncs.swap_view_right], [[Mode.Window, ["shift", "l"]]])
	addBinding([actionFuncs.swap_view_up], [[Mode.Window, ["shift", "k"]]])
	addBinding([actionFuncs.swap_view_down], [[Mode.Window, ["shift", "l"]]])
	addBinding([actionFuncs.newFile], [[Mode.Window, ["n"]]])
	addBinding([actionFuncs.toggleSidebarVisibility], [[Mode.Window, ["b"]]])
}

/*
	Just makes a generic binding for every key with every modifier so we can verify they work
*/
function loadBindingTestConfig() {
	resetBindings()
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["a"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["b"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["c"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["d"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["e"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["f"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["g"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["h"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["i"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["j"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["k"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["l"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["m"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["n"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["o"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["p"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["q"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["r"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["s"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["t"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["u"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["v"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["w"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["x"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["y"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["z"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["["]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["]"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["`"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, [";"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["'"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, [","]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["."]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["/"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["\\"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["="]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["-"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["1"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["2"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["3"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["4"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["5"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["6"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["7"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["8"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["9"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["0"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "a"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "b"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "c"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "d"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "e"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "f"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "g"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "h"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "i"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "j"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "k"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "l"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "m"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "n"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "o"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "p"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "q"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "r"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "s"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "t"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "u"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "v"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "w"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "x"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "y"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "z"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "["]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "]"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "`"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", ";"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "'"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", ","]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "."]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "/"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "\\"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "="]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "-"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "1"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "2"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "3"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "4"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "5"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "6"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "7"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "8"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "9"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "0"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["shift", "a"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["shift", "b"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["shift", "c"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["shift", "d"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["shift", "e"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["shift", "f"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["shift", "g"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["shift", "h"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["shift", "i"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["shift", "j"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["shift", "k"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["shift", "l"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["shift", "m"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["shift", "n"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["shift", "o"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["shift", "p"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["shift", "q"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["shift", "r"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["shift", "s"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["shift", "t"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["shift", "u"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["shift", "v"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["shift", "w"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["shift", "x"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["shift", "y"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["shift", "z"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["shift", "["]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["shift", "]"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["shift", "`"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["shift", ";"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["shift", "'"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["shift", ","]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["shift", "."]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["shift", "/"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["shift", "\\"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["shift", "="]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["shift", "-"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["shift", "1"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["shift", "2"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["shift", "3"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["shift", "4"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["shift", "5"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["shift", "6"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["shift", "7"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["shift", "8"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["shift", "9"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["shift", "0"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["alt", "a"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["alt", "b"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["alt", "c"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["alt", "d"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["alt", "e"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["alt", "f"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["alt", "g"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["alt", "h"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["alt", "i"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["alt", "j"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["alt", "k"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["alt", "l"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["alt", "m"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["alt", "n"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["alt", "o"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["alt", "p"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["alt", "q"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["alt", "r"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["alt", "s"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["alt", "t"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["alt", "u"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["alt", "v"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["alt", "w"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["alt", "x"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["alt", "y"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["alt", "z"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["alt", "["]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["alt", "]"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["alt", "`"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["alt", ";"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["alt", "'"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["alt", ","]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["alt", "."]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["alt", "/"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["alt", "\\"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["alt", "="]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["alt", "-"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["alt", "1"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["alt", "2"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["alt", "3"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["alt", "4"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["alt", "5"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["alt", "6"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["alt", "7"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["alt", "8"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["alt", "9"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["alt", "0"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "shift", "a"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "shift", "b"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "shift", "c"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "shift", "d"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "shift", "e"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "shift", "f"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "shift", "g"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "shift", "h"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "shift", "i"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "shift", "j"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "shift", "k"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "shift", "l"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "shift", "m"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "shift", "n"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "shift", "o"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "shift", "p"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "shift", "q"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "shift", "r"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "shift", "s"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "shift", "t"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "shift", "u"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "shift", "v"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "shift", "w"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "shift", "x"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "shift", "y"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "shift", "z"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "shift", "["]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "shift", "]"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "shift", "`"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "shift", ";"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "shift", "'"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "shift", ","]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "shift", "."]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "shift", "/"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "shift", "\\"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "shift", "="]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "shift", "-"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "shift", "1"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "shift", "2"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "shift", "3"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "shift", "4"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "shift", "5"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "shift", "6"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "shift", "7"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "shift", "8"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "shift", "9"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "shift", "0"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "alt", "a"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "alt", "b"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "alt", "c"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "alt", "d"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "alt", "e"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "alt", "f"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "alt", "g"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "alt", "h"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "alt", "i"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "alt", "j"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "alt", "k"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "alt", "l"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "alt", "m"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "alt", "n"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "alt", "o"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "alt", "p"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "alt", "q"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "alt", "r"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "alt", "s"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "alt", "t"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "alt", "u"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "alt", "v"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "alt", "w"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "alt", "x"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "alt", "y"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "alt", "z"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "alt", "["]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "alt", "]"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "alt", "`"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "alt", ";"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "alt", "'"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "alt", ","]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "alt", "."]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "alt", "/"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "alt", "\\"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "alt", "="]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "alt", "1"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "alt", "2"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "alt", "3"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "alt", "4"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "alt", "5"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "alt", "6"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "alt", "7"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "alt", "8"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "alt", "9"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "alt", "0"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["alt", "shift", "a"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["alt", "shift", "b"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["alt", "shift", "c"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["alt", "shift", "d"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["alt", "shift", "e"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["alt", "shift", "f"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["alt", "shift", "g"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["alt", "shift", "h"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["alt", "shift", "i"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["alt", "shift", "j"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["alt", "shift", "k"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["alt", "shift", "l"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["alt", "shift", "m"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["alt", "shift", "n"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["alt", "shift", "o"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["alt", "shift", "p"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["alt", "shift", "q"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["alt", "shift", "r"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["alt", "shift", "s"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["alt", "shift", "t"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["alt", "shift", "u"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["alt", "shift", "v"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["alt", "shift", "w"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["alt", "shift", "x"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["alt", "shift", "y"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["alt", "shift", "z"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["alt", "shift", "["]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["alt", "shift", "]"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["alt", "shift", "`"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["alt", "shift", ";"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["alt", "shift", "'"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["alt", "shift", ","]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["alt", "shift", "."]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["alt", "shift", "/"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["alt", "shift", "\\"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["alt", "shift", "="]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["alt", "shift", "-"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["alt", "shift", "1"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["alt", "shift", "2"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["alt", "shift", "3"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["alt", "shift", "4"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["alt", "shift", "5"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["alt", "shift", "6"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["alt", "shift", "7"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["alt", "shift", "8"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["alt", "shift", "9"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["alt", "shift", "0"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "shift", "alt", "a"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "shift", "alt", "b"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "shift", "alt", "c"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "shift", "alt", "d"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "shift", "alt", "e"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "shift", "alt", "f"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "shift", "alt", "g"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "shift", "alt", "h"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "shift", "alt", "i"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "shift", "alt", "j"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "shift", "alt", "k"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "shift", "alt", "l"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "shift", "alt", "m"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "shift", "alt", "n"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "shift", "alt", "o"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "shift", "alt", "p"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "shift", "alt", "q"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "shift", "alt", "r"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "shift", "alt", "s"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "shift", "alt", "t"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "shift", "alt", "u"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "shift", "alt", "v"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "shift", "alt", "w"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "shift", "alt", "x"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "shift", "alt", "y"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "shift", "alt", "z"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "shift", "alt", "["]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "shift", "alt", "]"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "shift", "alt", "`"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "shift", "alt", ";"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "shift", "alt", "'"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "shift", "alt", ","]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "shift", "alt", "."]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "shift", "alt", "/"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "shift", "alt", "\\"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "shift", "alt", "="]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "shift", "alt", "-"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "shift", "alt", "1"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "shift", "alt", "2"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "shift", "alt", "3"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "shift", "alt", "4"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "shift", "alt", "5"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "shift", "alt", "6"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "shift", "alt", "7"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "shift", "alt", "8"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "shift", "alt", "9"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "shift", "alt", "0"]]])

	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "pageup"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "pagedown"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "home"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "end"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["shift", "pageup"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["shift", "pagedown"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["shift", "home"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["shift", "end"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["alt", "pageup"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["alt", "pagedown"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["alt", "home"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["alt", "end"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "shift", "pageup"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "shift", "pagedown"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "shift", "home"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "shift", "end"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "alt", "pageup"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "alt", "pagedown"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "alt", "home"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "alt", "end"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["alt", "shift", "pageup"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["alt", "shift", "pagedown"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["alt", "shift", "home"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["alt", "shift", "end"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "shift", "alt", "pageup"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "shift", "alt", "pagedown"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "shift", "alt", "home"]]])
	addBinding([actionFuncs.goto_next_buffer], [[Mode.Normal, ["ctrl", "shift", "alt", "end"]]])
}