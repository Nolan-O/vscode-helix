const dirty_strings = {
	// Turns out this is the only one?
	// LSP says = and ' should be issues but they aren't
	["`"]: "backtick"
}

export function sanitizeCharForContext(str: string): string {
	if (dirty_strings[str] != undefined) {
		return dirty_strings[str]
	}

	return str
}