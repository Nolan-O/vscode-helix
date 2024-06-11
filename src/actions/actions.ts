import * as vscode from 'vscode';
import { Action, Action2, BindingStructure } from '../action_types';
import { HelixState } from '../helix_state_types';
import {
  enterInsertMode,
  enterNormalMode,
  enterSearchMode,
  enterSelectMode,
  enterVisualLineMode,
  enterVisualMode,
  setModeCursorStyle,
  enterWindowMode,
  enterViewMode,
  enterMatchMode
} from '../modes';
import { Mode } from '../modes_types';
import { parseKeysExact, parseKeysRegex } from '../parse_keys';
import * as positionUtils from '../position_utils';
import { putAfter } from '../put_utils/put_after';
import { putBefore } from '../put_utils/put_before';
import { removeTypeSubscription, setTypeSubscription } from '../type_subscription';
import { flashYankHighlight } from '../yank_highlight';
import KeyMap from './keymaps';
import { delete_, isSingleLineRange, yank } from './operators';
import { paragraphBackward, paragraphForward } from '../paragraph_utils';
import { setVisualLineSelections } from '../visual_line_utils';
import { setVisualSelections } from '../visual_utils';
import { whitespaceWordRanges, wordRanges } from '../word_utils';
import { typeHandler } from '../type_handler';
import * as motions from './motions';

enum Direction {
  Up,
  Down,
}

export let actions2: BindingStructure = {
  [Mode.Disabled]: {},
  [Mode.Insert]: {},
  [Mode.Normal]: {},
  [Mode.Visual]: {},
  [Mode.VisualLine]: {},
  [Mode.Occurrence]: {},
  [Mode.Window]: {},
  [Mode.SearchInProgress]: {},
  [Mode.CommandlineInProgress]: {},
  [Mode.Select]: {},
  [Mode.View]: {},
  [Mode.Match]: {},
}

// Returns true if a binding was found or if the input has not ruled out the possibility of future keys finding a binding
function matchInput(vimState: HelixState): Action2[] | boolean {
  let chars = vimState.keysPressed
  let binding = actions2[vimState.mode]
  for (let i = 0; i < chars.length; i++) {
    binding = binding[chars[i]]

    if (binding === undefined) {
      return false
    }
  }

  if (Array.isArray(binding)) {
    return binding
  }

  return true
}

// return true if actions were executed
export function tryConsumeChord(helixState: HelixState) {
  const editor = vscode.window.activeTextEditor
  if (editor === undefined) {
    return
  }

  let actions = matchInput(helixState)
  console.log(helixState.keysPressed)

  if (actions === false) {
    helixState.keysPressed = [];
    helixState.numbersPressed = [];
    return false;
  } else if (actions === true) {
    return false;
  } else {
    for (let action of actions) {
      action(helixState, editor)
    }
    helixState.keysPressed = [];
    helixState.numbersPressed = [];
    return true;
  }
}

export function handleMatchInput(helixState: HelixState) {

}


function getMatchPairs(char: string) {
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

export const actionFuncs: { [key: string]: Action2 } = {
  /*
    Modes
  */
  normal_mode: (helixState, editor) => {
    if (helixState.mode === Mode.Insert || helixState.mode === Mode.Occurrence) {
      editor.selections = editor.selections.map((selection) => {
        const newPosition = positionUtils.left(selection.active);
        return new vscode.Selection(newPosition, newPosition);
      });

      enterNormalMode(helixState);
      setModeCursorStyle(helixState.mode, editor);
      setTypeSubscription(helixState, typeHandler);
    } else if (helixState.mode === Mode.Normal) {
      // Clear multiple cursors
      if (editor.selections.length > 1) {
        editor.selections = [editor.selections[0]];
      }
      // There is no way to check if find widget is open, so just close it
      vscode.commands.executeCommand('closeFindWidget');
    } else if (helixState.mode === Mode.Visual) {
      editor.selections = editor.selections.map((selection) => {
        const newPosition = new vscode.Position(selection.active.line, Math.max(selection.active.character - 1, 0));
        return new vscode.Selection(newPosition, newPosition);
      });

      enterNormalMode(helixState);
      setModeCursorStyle(helixState.mode, editor);
    } else if (helixState.mode === Mode.VisualLine) {
      editor.selections = editor.selections.map((selection) => {
        const newPosition = selection.active.with({
          character: Math.max(selection.active.character - 1, 0),
        });
        return new vscode.Selection(newPosition, newPosition);
      });

      enterNormalMode(helixState);
      setModeCursorStyle(helixState.mode, editor);
    } else if (helixState.mode === Mode.SearchInProgress || helixState.mode === Mode.Select) {
      enterNormalMode(helixState);
      helixState.searchState.clearSearchString(helixState);
      // To match Helix UI go back to the last active position on escape
      if (helixState.searchState.lastActivePosition) {
        editor.selection = new vscode.Selection(
          helixState.searchState.lastActivePosition,
          helixState.searchState.lastActivePosition,
        );
        helixState.editorState.activeEditor?.revealRange(
          editor.selection,
          vscode.TextEditorRevealType.InCenterIfOutsideViewport,
        );
      }
    } else if (helixState.mode === Mode.View) {
      enterNormalMode(helixState);
    }

    helixState.keysPressed = [];
  },
  select_mode: (vimState, editor) => {
    enterVisualMode(vimState);
    setModeCursorStyle(vimState.mode, editor);
  },
  insert_mode: (vimState, editor) => {
    enterInsertMode(vimState);
    setModeCursorStyle(vimState.mode, editor);
    removeTypeSubscription(vimState);
  },
  append_mode: (vimState, editor) => {
    enterInsertMode(vimState, false);
    setModeCursorStyle(vimState.mode, editor);
    removeTypeSubscription(vimState);
  },
  search: (helixState) => {
    enterSearchMode(helixState);
  },
  rsearch: (helixState) => {
    enterSearchMode(helixState);
    helixState.searchState.previousSearchResult(helixState);
  },
  select_regex: (helixState, editor) => {
    enterSelectMode(helixState);
    // if we enter select mode we should save the current selection
    helixState.currentSelection = editor.selection;
  },
  enterWindowMode: (helixState) => {
    enterWindowMode(helixState);
  },
  view_mode: (helixState) => {
    enterViewMode(helixState);
  },
  match_mode: (helixState) => {
    enterMatchMode(helixState);
  },
  extend_line_below: (vimState: HelixState) => {
    vscode.commands.executeCommand('expandLineSelection');
  },
  addSelectionToPreviousFindMatch: () => {
    vscode.commands.executeCommand('editor.action.addSelectionToPreviousFindMatch');
  },
  selectHighlights: () => {
    vscode.commands.executeCommand('editor.action.selectHighlights');
  },
  search_next: (helixState) => {
    vscode.commands.executeCommand('editor.action.nextMatchFindAction');
  },
  search_prev: (helixState) => {
    if (helixState.searchState.selectModeActive) {
      vscode.commands.executeCommand('actions.findWithSelection');
      helixState.searchState.selectModeActive = false;
      return;
    }
    vscode.commands.executeCommand('editor.action.previousMatchFindAction');
  },
  search_selection: (helixState) => {
    if (helixState.searchState.selectModeActive) {
      vscode.commands.executeCommand('actions.findWithSelection');
      helixState.searchState.selectModeActive = false;
      return;
    }
  },
  insert_at_line_start: (vimState, editor) => {
    editor.selections = editor.selections.map((selection) => {
      const character = editor.document.lineAt(selection.active.line).firstNonWhitespaceCharacterIndex;
      const newPosition = selection.active.with({ character: character });
      return new vscode.Selection(newPosition, newPosition);
    });

    enterInsertMode(vimState);
    setModeCursorStyle(vimState.mode, editor);
    removeTypeSubscription(vimState);
  },
  insert_at_line_end: (vimState, editor) => {
    editor.selections = editor.selections.map((selection) => {
      const lineLength = editor.document.lineAt(selection.active.line).text.length;
      const newPosition = selection.active.with({ character: lineLength });
      return new vscode.Selection(newPosition, newPosition);
    });

    enterInsertMode(vimState);
    setModeCursorStyle(vimState.mode, editor);
    removeTypeSubscription(vimState);
  },
  keep_primary_selection: (_, editor) => {
    // Keep primary selection only
    editor.selections = editor.selections.slice(0, 1);
  },
  searchWithSelection: (_) => {
    vscode.commands.executeCommand('actions.findWithSelection');
  },
  indent: (_) => {
    vscode.commands.executeCommand('editor.action.indentLines');
  },
  unindent: (_) => {
    vscode.commands.executeCommand('editor.action.outdentLines');
  },
  format_selections: (_) => {
    vscode.commands.executeCommand('editor.action.formatSelection');
  },
  switch_to_lowercase: (vimState, editor) => {
    // Take the selection and make it all lowercase
    editor.edit((editBuilder) => {
      editor.selections.forEach((selection) => {
        const text = editor.document.getText(selection);
        editBuilder.replace(selection, text.toLowerCase());
      });
    });
  },
  switch_to_uppercase: (vimState, editor) => {
    // Take the selection and make it all lowercase
    editor.edit((editBuilder) => {
      editor.selections.forEach((selection) => {
        const text = editor.document.getText(selection);
        editBuilder.replace(selection, text.toUpperCase());
      });
    });
  },
  switch_case: (vimState, editor) => {
    // Switch the case of the selection (so if upper case make lower case and vice versa)
    editor.edit((editBuilder) => {
      editor.selections.forEach((selection) => {
        const text = editor.document.getText(selection);
        editBuilder.replace(
          selection,
          text.replace(/./g, (c) => (c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase())),
        );
      });
    });
  },
  open_below: (vimState, editor) => {
    enterInsertMode(vimState);
    vscode.commands.executeCommand('editor.action.insertLineAfter');
    setModeCursorStyle(vimState.mode, editor);
    removeTypeSubscription(vimState);
  },
  open_above: (vimState, editor) => {
    enterInsertMode(vimState);
    vscode.commands.executeCommand('editor.action.insertLineBefore');
    setModeCursorStyle(vimState.mode, editor);
    removeTypeSubscription(vimState);
  },
  paste_after: putAfter,
  paste_before: putBefore,
  undo: () => {
    vscode.commands.executeCommand('undo');
  },
  redo: () => {
    vscode.commands.executeCommand('redo');
  },
  collapse_selection: (vimState, editor) => {
    const active = editor.selection.active;
    editor.selection = new vscode.Selection(active, active);
  },
  moveEditorRight: (helixState) => {
    vscode.commands.executeCommand('workbench.action.moveEditorToNextGroup');
    enterNormalMode(helixState);
  },
  moveEditorDown: (helixState) => {
    vscode.commands.executeCommand('workbench.action.moveEditorToBelowGroup');
    enterNormalMode(helixState);
  },
  moveEditorLeft: (helixState) => {
    vscode.commands.executeCommand('workbench.action.moveEditorToPreviousGroup');
    enterNormalMode(helixState);
  },
  moveEditorNewWindow: (helixState) => {
    vscode.commands.executeCommand('workbench.action.moveEditorToNewWindow');
    enterNormalMode(helixState);
  },
  moveEditorMainWindow: (helixState) => {
    vscode.commands.executeCommand('workbench.action.restoreEditorsToMainWindow');
    enterNormalMode(helixState);
  },
  yank: (vimState, editor) => {
    // Yank highlight
    const highlightRanges = editor.selections.map((selection) => selection.with());

    // We need to detect if the ranges are lines because we need to handle them differently
    highlightRanges.every((range) => isSingleLineRange(range));
    yank(vimState, editor, highlightRanges, false);
    flashYankHighlight(editor, highlightRanges);
    if (vimState.mode === Mode.Visual) {
      enterNormalMode(vimState);
    }
  },

  /*
    Window actions
  */
  rotate_view: (helixState) => {
    vscode.commands.executeCommand('workbench.action.navigateEditorGroups');
    enterNormalMode(helixState);
  },
  vsplit: (helixState) => {
    vscode.commands.executeCommand('workbench.action.splitEditor');
    enterNormalMode(helixState);
  },
  hsplit: (helixState) => {
    vscode.commands.executeCommand('workbench.action.splitEditorDown');
    enterNormalMode(helixState);
  },
  // maps to ctrl w f & ctrl w shift f since this is the only suitable replacement for both vscode.commands in helix
  goto_file: (helixState) => {
    vscode.commands.executeCommand('editor.action.revealDefinitionAside');
    enterNormalMode(helixState);
  },
  jump_view_left: (helixState) => {
    vscode.commands.executeCommand('workbench.action.focusLeftGroup');
    enterNormalMode(helixState);
  },
  jump_view_right: (helixState) => {
    vscode.commands.executeCommand('workbench.action.focusRightGroup');
    enterNormalMode(helixState);
  },
  jump_view_down: (helixState) => {
    vscode.commands.executeCommand('workbench.action.focusBelowGroup');
    enterNormalMode(helixState);
  },
  jump_view_up: (helixState) => {
    vscode.commands.executeCommand('workbench.action.focusAboveGroup');
    enterNormalMode(helixState);
  },
  wclose: (helixState) => {
    vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    enterNormalMode(helixState);
  },
  wonly: (helixState) => {
    vscode.commands.executeCommand('workbench.action.closeOtherEditors');
    enterNormalMode(helixState);
  },
  swap_view_left: (helixState) => {
    vscode.commands.executeCommand('workbench.action.moveActiveEditorGroupLeft');
    enterNormalMode(helixState);
  },
  swap_view_right: (helixState) => {
    vscode.commands.executeCommand('workbench.action.moveActiveEditorGroupRight');
    enterNormalMode(helixState);
  },
  swap_view_up: (helixState) => {
    vscode.commands.executeCommand('workbench.action.moveActiveEditorGroupUp');
    enterNormalMode(helixState);
  },
  swap_view_down: (helixState) => {
    vscode.commands.executeCommand('workbench.action.moveActiveEditorGroupDown');
    enterNormalMode(helixState);
  },
  newFile: (helixState) => {
    vscode.commands.executeCommand('workbench.action.files.newUntitledFile');
    enterNormalMode(helixState);
  },
  toggleSidebarVisibility: (helixState) => {
    vscode.commands.executeCommand('workbench.action.toggleSidebarVisibility');
    enterNormalMode(helixState);
  },

  /*
    Goto actions
   */
  goto_last_modification: () => {
    vscode.commands.executeCommand('workbench.action.navigateToLastEditLocation');
  },
  goto_file_start: (helixState, editor) => {
    if (helixState.mode === Mode.Normal) {
      const count = helixState.resolveCount();
      if (count !== 1) {
        const range = editor.document.lineAt(count - 1).range;
        editor.selection = new vscode.Selection(range.start, range.end);
        editor.revealRange(range);
        return;
      }

      vscode.commands.executeCommand('cursorTop');
    } else if (helixState.mode === Mode.Visual) {
      const count = helixState.resolveCount();
      if (count !== 1) {
        const position = editor.selection.active;
        const range = editor.document.lineAt(count - 1).range;
        if (position.isBefore(range.start)) {
          editor.selection = new vscode.Selection(position, range.end);
        } else {
          editor.selection = new vscode.Selection(position, range.start);
        }
        return;
      }

      vscode.commands.executeCommand('cursorTopSelect');
    }
  },
  goto_last_line: (helixState) => {
    if (helixState.mode === Mode.Normal) {
      vscode.commands.executeCommand('cursorBottom');
    } else if (helixState.mode === Mode.Visual) {
      vscode.commands.executeCommand('cursorBottomSelect');
    }
  },

  goto_line_start: (helixState) => {
    if (helixState.mode === Mode.Normal) {
      vscode.commands.executeCommand('cursorLineStart');
    } else if (helixState.mode === Mode.Visual) {
      vscode.commands.executeCommand('cursorLineStartSelect');
    }
  },
  goto_line_end: (helixState) => {
    if (helixState.mode === Mode.Normal) {
      vscode.commands.executeCommand('cursorLineEnd');
    } else if (helixState.mode === Mode.Visual) {
      vscode.commands.executeCommand('cursorLineEndSelect');
    }
  },
  goto_first_nonwhitespace: (helixState) => {
    if (helixState.mode === Mode.Normal) {
      vscode.commands.executeCommand('cursorHome');
    } else if (helixState.mode === Mode.Visual) {
      vscode.commands.executeCommand('cursorHomeSelect');
    }
  },
  goto_definition: () => {
    vscode.commands.executeCommand('editor.action.revealDefinition');
  },
  goto_type_definition: () => {
    vscode.commands.executeCommand('editor.action.goToTypeDefinition');
  },
  goto_reference: () => {
    vscode.commands.executeCommand('editor.action.goToReferences');
  },
  gotoPageUp: (helixState) => {
    if (helixState.mode === Mode.Normal) {
      vscode.commands.executeCommand('cursorPageUp');
    } else if (helixState.mode === Mode.Visual) {
      vscode.commands.executeCommand('cursorPageUpSelect');
    }
  },
  gotoPageDown: (helixState) => {
    if (helixState.mode === Mode.Normal) {
      vscode.commands.executeCommand('cursorPageDown');
    } else if (helixState.mode === Mode.Visual) {
      vscode.commands.executeCommand('cursorPageDownSelect');
    }
  },
  gotoWindowCenter: (helixState) => {
    if (helixState.mode === Mode.Normal) {
      vscode.commands.executeCommand('cursorMove', {
        to: 'viewPortCenter',
      });
    } else if (helixState.mode === Mode.Visual) {
      vscode.commands.executeCommand('cursorMove', {
        to: 'viewPortCenter',
        select: true,
      });
    }
  },
  move_line_up: () => {
    vscode.commands.executeCommand('scrollLineUp');
  },
  move_line_down: () => {
    vscode.commands.executeCommand('scrollLineDown');
  },
  goto_last_accessed_file: (helixState) => {
    // VS Code has no concept of "last accessed file" so instead we'll need to keep track of previous text editors
    const editor = helixState.editorState.previousEditor;
    if (!editor) return;

    vscode.window.showTextDocument(editor.document);
  },
  goto_last_modified_file: (helixState) => {
    // VS Code has no concept of "last accessed file" so instead we'll need to keep track of previous text editors
    const document = helixState.editorState.lastModifiedDocument;
    if (!document) return;

    vscode.window.showTextDocument(document);
  },
  goto_next_buffer: () => {
    vscode.commands.executeCommand('workbench.action.nextEditor');
  },
  goto_previous_buffer: () => {
    vscode.commands.executeCommand('workbench.action.previousEditor');
  },

  /*
    Space menu
   */
  file_picker: () => {
    vscode.commands.executeCommand('workbench.action.quickOpen');
  },
  debugView: () => {
    vscode.commands.executeCommand('workbench.debug.action.focusBreakpointsView');
  },
  hover: () => {
    vscode.commands.executeCommand('editor.action.showHover');
  },
  symbol_picker: () => {
    vscode.commands.executeCommand('workbench.action.gotoSymbol');
  },
  workspace_symbol_picker: () => {
    vscode.commands.executeCommand('workbench.action.showAllSymbols');
  },
  diagnostics_picker: () => {
    vscode.commands.executeCommand('workbench.actions.view.problems');
    // It's not possible to set active file on and off, you can only toggle it, which makes implementing this difficult
    // For now both d and D will do the same thing and search all of the workspace

    // Leaving this here for future reference
    // vscode.commands.executeCommand('workbench.actions.workbench.panel.markers.view.toggleActiveFile');
  },
  workspace_diagnostics_picker: () => {
    // alias of 'd'. See above
    vscode.commands.executeCommand('workbench.actions.view.problems');
  },
  rename_symbol: () => {
    vscode.commands.executeCommand('editor.action.rename');
  },
  code_action: () => {
    vscode.commands.executeCommand('editor.action.quickFix');
  },
  global_search: () => {
    vscode.commands.executeCommand('workbench.action.findInFiles');
  },
  command_palette: () => {
    vscode.commands.executeCommand('workbench.action.showCommands');
  },

  /*
    View mode
  */
  alignViewCenter: (_, editor) => {
    vscode.commands.executeCommand('revealLine', {
      lineNumber: editor.selection.active.line,
      at: 'center',
    });
  },
  alignViewTop: (_, editor) => {
    vscode.commands.executeCommand('revealLine', {
      lineNumber: editor.selection.active.line,
      at: 'top',
    });
  },
  alignViewBottom: (_, editor) => {
    vscode.commands.executeCommand('revealLine', {
      lineNumber: editor.selection.active.line,
      at: 'bottom',
    });
  },

  /*
    Brackets
  */
  goto_next_diag: () => {
    vscode.commands.executeCommand('editor.action.marker.next');
  },
  goto_prev_diag: () => {
    vscode.commands.executeCommand('editor.action.marker.prev');
  },
  goto_last_diag: () => {
    vscode.commands.executeCommand('editor.action.marker.nextInFiles');
  },
  goto_first_diag: () => {
    vscode.commands.executeCommand('editor.action.marker.prevInFiles');
  },
  goto_prev_change: () => {
    // There is no way to check if we're in compare editor mode or not so i need to call both commands
    vscode.commands.executeCommand('workbench.action.compareEditor.previousChange');
    vscode.commands.executeCommand('workbench.action.editor.previousChange');
  },
  goto_next_change: () => {
    // There is no way to check if we're in compare editor mode or not so i need to call both commands
    vscode.commands.executeCommand('workbench.action.compareEditor.nextChange');
    vscode.commands.executeCommand('workbench.action.editor.nextChange');
  },
  goto_next_function: (helixState, editor) => {
    const range = helixState.symbolProvider.getNextFunctionRange(editor);
    if (range) {
      editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
      editor.selection = new vscode.Selection(range.start, range.end);
    }
  },
  goto_prev_function: (helixState, editor) => {
    const range = helixState.symbolProvider.getPreviousFunctionRange(editor);
    if (range) {
      editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
      editor.selection = new vscode.Selection(range.start, range.end);
    }
  },

  /*
    Match mode
  */
  // Implemenent jump to bracket
  jumpToBracket: () => {
    vscode.commands.executeCommand('editor.action.jumpToBracket');
  },

  selectToBracket: () => {
    vscode.commands.executeCommand('editor.action.selectToBracket');
  },

  // Delete match
  deleteMatch: (helixState, editor) => {
    const ranges = editor.selections.map((selection) => selection.with());
    yank(helixState, editor, ranges, false);
    delete_(editor, ranges, false);
  },

  backspaceOverride: (helixState, editor) => {
    const ranges = editor.selections.map((selection) => selection.with());
    delete_(editor, ranges, false);
  },

  searchBackspaceOverride: (helixState, editor) => {
    helixState.searchState.backspace(helixState)
  },

  // edit match
  changeMatch: (helixState, editor) => {
    const ranges = editor.selections.map((selection) => selection.with());
    delete_(editor, ranges, false);
    enterInsertMode(helixState);
    setModeCursorStyle(helixState.mode, editor);
    removeTypeSubscription(helixState);
  },

  // implement match add to selection
  /*   parseKeysRegex(/^ ms(.)$/, / ^ ms /, [Mode.Normal, Mode.Visual], (helixState, editor, match) => {
      const char = match[1];
      const [startChar, endChar] = getMatchPairs(char);
      // Add char to both ends of each selection
      editor.edit((editBuilder) => {
        // Add char to both ends of each selection
        editor.selections.forEach((selection) => {
          const start = selection.start;
          const end = selection.end;
          editBuilder.insert(start, startChar);
          editBuilder.insert(end, endChar);
        });
      });
    }, */

  // implement match replace to selection
  /*   parseKeysRegex(/^ mr(.)(.)$/, / ^ mr(.) ? /, [Mode.Normal, Mode.Visual], (helixState, editor, match) => {
        const original = match[1];
  const replacement = match[2];
  const [startCharOrig, endCharOrig] = getMatchPairs(original);
  const [startCharNew, endCharNew] = getMatchPairs(replacement);
  const num = helixState.resolveCount();
  
  const forwardPosition = searchForwardBracket(
    editor.document,
    startCharOrig,
    endCharOrig,
    editor.selection.active,
    num,
  );
  const backwardPosition = searchBackwardBracket(
    editor.document,
    startCharOrig,
    endCharOrig,
    editor.selection.active,
    num,
  );
  
  if (forwardPosition === undefined || backwardPosition === undefined) return;
  
  // Add char to both ends of each selection
  editor.edit((editBuilder) => {
    // Add char to both ends of each selection
    editBuilder.replace(
      new vscode.Range(forwardPosition, forwardPosition.with({ character: forwardPosition.character + 1 })),
      endCharNew,
    );
    editBuilder.replace(
      new vscode.Range(backwardPosition, backwardPosition.with({ character: backwardPosition.character + 1 })),
      startCharNew,
    );
  });
      }, */

  // implement match delete character
  /*   parseKeysRegex(/^ md(.)$/, / ^ md /, [Mode.Normal, Mode.Visual], (helixState, editor, match) => {
      const char = match[1];
      const [startChar, endChar] = getMatchPairs(char);
      const num = helixState.resolveCount();
  
      const forwardPosition = searchForwardBracket(editor.document, startChar, endChar, editor.selection.active, num);
      const backwardPosition = searchBackwardBracket(editor.document, startChar, endChar, editor.selection.active, num);
  
      if (forwardPosition === undefined || backwardPosition === undefined) return;
  
      // Add char to both ends of each selection
      editor.edit((editBuilder) => {
        // Add char to both ends of each selection
        editBuilder.delete(
          new vscode.Range(forwardPosition, forwardPosition.with({ character: forwardPosition.character + 1 })),
        );
        editBuilder.delete(
          new vscode.Range(backwardPosition, backwardPosition.with({ character: backwardPosition.character + 1 })),
        );
      });
    }, */

  move_char_right: (vimState, editor) => {
    if (vimState.mode === Mode.Visual) {
      motions.execMotion(vimState, editor, ({ document, position }) => {
        return positionUtils.rightNormal(document, position, vimState.resolveCount());
      });
    } else if (vimState.mode === Mode.Normal) {
      vscode.commands.executeCommand('cursorRight');
    }
  },

  move_char_left: (vimState, editor) => {
    if (vimState.mode === Mode.Visual) {
      motions.execMotion(vimState, editor, ({ position }) => {
        return positionUtils.left(position, vimState.resolveCount());
      });
    } else if (vimState.mode === Mode.Normal) {
      vscode.commands.executeCommand('cursorLeft');
    }
  },

  move_visual_line_up: (vimState, editor) => {
    if (vimState.mode === Mode.Normal) {
      vscode.commands.executeCommand('cursorMove', {
        to: 'up',
        by: 'wrappedLine',
        value: vimState.resolveCount(),
      });
    } else if (vimState.mode === Mode.Visual) {
      const originalSelections = editor.selections;

      vscode.commands
        .executeCommand('cursorMove', {
          to: 'up',
          by: 'wrappedLine',
          select: true,
          value: vimState.resolveCount(),
        })
        .then(() => {
          setVisualSelections(editor, originalSelections);
        });
    } else if (vimState.mode === Mode.VisualLine) {
      vscode.commands
        .executeCommand('cursorMove', { to: 'up', by: 'line', select: true, value: vimState.resolveCount() })
        .then(() => {
          setVisualLineSelections(editor);
        });
    }
  },

  move_visual_line_down: (vimState, editor) => {
    if (vimState.mode === Mode.Normal) {
      vscode.commands.executeCommand('cursorMove', {
        to: 'down',
        by: 'wrappedLine',
        value: vimState.resolveCount(),
      });
    } else if (vimState.mode === Mode.Visual) {
      const originalSelections = editor.selections;

      vscode.commands
        .executeCommand('cursorMove', {
          to: 'down',
          by: 'wrappedLine',
          select: true,
          value: vimState.resolveCount(),
        })
        .then(() => {
          setVisualSelections(editor, originalSelections);
        });
    } else if (vimState.mode === Mode.VisualLine) {
      vscode.commands.executeCommand('cursorMove', { to: 'down', by: 'line', select: true }).then(() => {
        setVisualLineSelections(editor);
      });
    }
  },

  move_next_word_start: motions.createWordForwardHandler(wordRanges),
  move_next_long_word_start: motions.createWordForwardHandler(whitespaceWordRanges),

  move_prev_word_start: motions.createWordBackwardHandler(wordRanges),
  move_prev_long_word_start: motions.createWordBackwardHandler(whitespaceWordRanges),

  move_next_word_end: motions.createWordEndHandler(wordRanges),
  move_next_long_word_end: motions.createWordEndHandler(whitespaceWordRanges),

  goto_next_paragraph: (vimState, editor) => {
    motions.execMotion(vimState, editor, ({ document, position }) => {
      return new vscode.Position(paragraphForward(document, position.line), 0);
    });
  },

  goto_prev_paragraph: (vimState, editor) => {
    motions.execMotion(vimState, editor, ({ document, position }) => {
      return new vscode.Position(paragraphBackward(document, position.line), 0);
    });
  },

  moveLineEnd: (vimState, editor) => {
    motions.execMotion(vimState, editor, ({ document, position }) => {
      const lineLength = document.lineAt(position.line).text.length;
      return position.with({ character: Math.max(lineLength - 1, 0) });
    });
  },

  moveLineStart: (vimState, editor) => {
    motions.execMotion(vimState, editor, ({ document, position }) => {
      const line = document.lineAt(position.line);
      return position.with({
        character: line.firstNonWhitespaceCharacterIndex,
      });
    });
  },

  goto_window_top: (vimState, editor) => {
    if (vimState.mode === Mode.Normal) {
      vscode.commands.executeCommand('cursorMove', {
        to: 'viewPortTop',
        by: 'line',
      });
    } else if (vimState.mode === Mode.Visual) {
      const originalSelections = editor.selections;

      vscode.commands
        .executeCommand('cursorMove', {
          to: 'viewPortTop',
          by: 'line',
          select: true,
        })
        .then(() => {
          setVisualSelections(editor, originalSelections);
        });
    } else if (vimState.mode === Mode.VisualLine) {
      vscode.commands
        .executeCommand('cursorMove', {
          to: 'viewPortTop',
          by: 'line',
          select: true,
        })
        .then(() => {
          setVisualLineSelections(editor);
        });
    }
  },

  goto_window_center: (vimState, editor) => {
    if (vimState.mode === Mode.Normal) {
      vscode.commands.executeCommand('cursorMove', {
        to: 'viewPortCenter',
        by: 'line',
      });
    } else if (vimState.mode === Mode.Visual) {
      const originalSelections = editor.selections;

      vscode.commands
        .executeCommand('cursorMove', {
          to: 'viewPortCenter',
          by: 'line',
          select: true,
        })
        .then(() => {
          setVisualSelections(editor, originalSelections);
        });
    } else if (vimState.mode === Mode.VisualLine) {
      vscode.commands
        .executeCommand('cursorMove', {
          to: 'viewPortCenter',
          by: 'line',
          select: true,
        })
        .then(() => {
          setVisualLineSelections(editor);
        });
    }
  },

  goto_window_bottom: (vimState, editor) => {
    if (vimState.mode === Mode.Normal) {
      vscode.commands.executeCommand('cursorMove', {
        to: 'viewPortBottom',
        by: 'line',
      });
    } else if (vimState.mode === Mode.Visual) {
      const originalSelections = editor.selections;

      vscode.commands
        .executeCommand('cursorMove', {
          to: 'viewPortBottom',
          by: 'line',
          select: true,
        })
        .then(() => {
          setVisualSelections(editor, originalSelections);
        });
    } else if (vimState.mode === Mode.VisualLine) {
      vscode.commands
        .executeCommand('cursorMove', {
          to: 'viewPortBottom',
          by: 'line',
          select: true,
        })
        .then(() => {
          setVisualLineSelections(editor);
        });
    }
  },


  /*     parseKeysRegex(/^f(.)$/, /^(f|f.)$/, [Mode.Normal, Mode.Visual], (vimState, editor, match) => {
        findForward(vimState, editor, match);
    
        vimState.repeatLastMotion = (innerVimState, innerEditor) => {
          findForward(innerVimState, innerEditor, match);
        };
      }),
    
      parseKeysRegex(/^F(.)$/, /^(F|F.)$/, [Mode.Normal, Mode.Visual], (vimState, editor, match) => {
        findBackward(vimState, editor, match);
    
        vimState.repeatLastMotion = (innerVimState, innerEditor) => {
          findBackward(innerVimState, innerEditor, match);
        };
      }),
    
      parseKeysRegex(/^t(.)$/, /^t$/, [Mode.Normal, Mode.Visual], (vimState, editor, match) => {
        tillForward(vimState, editor, match);
    
        vimState.repeatLastMotion = (innerVimState, innerEditor) => {
          tillForward(innerVimState, innerEditor, match);
        };
      }),
    
      parseKeysRegex(/^T(.)$/, /^T$/, [Mode.Normal, Mode.Visual], (vimState, editor, match) => {
        tillBackward(vimState, editor, match);
    
        vimState.repeatLastMotion = (innerVimState, innerEditor) => {
          tillBackward(innerVimState, innerEditor, match);
        };
      }), */
}

// These are all legacy and waiting to be ported to the new actions array
export const actions: Action[] = [

  // 	replace
  parseKeysRegex(/^r(.)/, /^r/, [Mode.Normal], (helixState, editor, match) => {
    const position = editor.selection.active;
    editor.edit((builder) => {
      builder.replace(new vscode.Range(position, position.with({ character: position.character + 1 })), match[1]);
    });
  }),

  parseKeysExact(['d', 'd'], [Mode.Normal], (vimState, editor) => {
    deleteLine(vimState, editor);
  }),

  parseKeysExact(['D'], [Mode.Normal], () => {
    vscode.commands.executeCommand('deleteAllRight');
  }),

  parseKeysRegex(/(\\d+)g/, /^g$/, [Mode.Normal, Mode.Visual], (helixState, editor, match) => {
    new vscode.Position(parseInt(match[1]), 0);
  }),

  // add 1 character swap
  parseKeysRegex(/^x(.)$/, /^x$/, [Mode.Normal, Mode.Visual], (vimState, editor, match) => {
    editor.edit((builder) => {
      editor.selections.forEach((s) => {
        const oneChar = s.with({
          end: s.active.with({
            character: s.active.character + 1,
          }),
        });
        builder.replace(oneChar, match[1]);
      });
    });
  }),

  // same for rip command
  parseKeysRegex(
    RegExp(`^r(\\d+)(${KeyMap.Motions.MoveUp}|${KeyMap.Motions.MoveDown})$`),
    /^(r|r\d+)$/,
    [Mode.Normal, Mode.Visual],
    (vimState, editor, match) => {
      const lineCount = parseInt(match[1]);
      const direction = match[2] == KeyMap.Motions.MoveUp ? Direction.Up : Direction.Down;
      // console.log(`delete ${lineCount} lines up`);
      const selections = makeMultiLineSelection(vimState, editor, lineCount, direction);

      yank(vimState, editor, selections, true);

      deleteLines(vimState, editor, lineCount, direction);
    },
  ),

  // same for duplicate command
  parseKeysRegex(
    RegExp(`^q(\\d+)(${KeyMap.Motions.MoveUp}|${KeyMap.Motions.MoveDown})$`),
    /^(q|q\d+)$/,
    [Mode.Normal, Mode.Visual],
    (vimState, editor, match) => {
      const lineCount = parseInt(match[1]);
      const direction = match[2] == KeyMap.Motions.MoveUp ? Direction.Up : Direction.Down;
      // console.log(`delete ${lineCount} lines up`);
      editor.selections = makeMultiLineSelection(vimState, editor, lineCount, direction);
      vscode.commands.executeCommand('editor.action.copyLinesDownAction');
    },
  ),

  // Change
  parseKeysExact(['c', 'c'], [Mode.Normal], (vimState, editor) => {
    editor.edit((editBuilder) => {
      editor.selections.forEach((selection) => {
        const line = editor.document.lineAt(selection.active.line);
        editBuilder.delete(
          new vscode.Range(
            selection.active.with({
              character: line.firstNonWhitespaceCharacterIndex,
            }),
            selection.active.with({ character: line.text.length }),
          ),
        );
      });
    });

    enterInsertMode(vimState);
    setModeCursorStyle(vimState.mode, editor);
    removeTypeSubscription(vimState);
  }),

  // Delete to end of line
  parseKeysExact(['C'], [Mode.Normal], (vimState, editor) => {
    vscode.commands.executeCommand('deleteAllRight');
    enterInsertMode(vimState);
    setModeCursorStyle(vimState.mode, editor);
    removeTypeSubscription(vimState);
  }),

  // yank
  parseKeysExact(['y', 'y'], [Mode.Normal], (vimState, editor) => {
    yankLine(vimState, editor);

    // Yank highlight
    const highlightRanges = editor.selections.map((selection) => {
      const lineLength = editor.document.lineAt(selection.active.line).text.length;
      return new vscode.Range(
        selection.active.with({ character: 0 }),
        selection.active.with({ character: lineLength }),
      );
    });
    flashYankHighlight(editor, highlightRanges);
  }),
  // Made up
  parseKeysExact(['q', 'q'], [Mode.Normal, Mode.Visual], () => {
    vscode.commands.executeCommand('editor.action.copyLinesDownAction');
  }),

  // Made up
  parseKeysExact(['Q', 'Q'], [Mode.Normal, Mode.Visual], () => {
    vscode.commands.executeCommand('editor.action.copyLinesUpAction');
  }),

  // Made up, should be replace
  parseKeysExact(['r', 'r'], [Mode.Normal], (vimState, editor) => {
    yankLine(vimState, editor);
    deleteLine(vimState, editor);
  }),

  parseKeysExact(['s', 's'], [Mode.Normal], (vimState, editor) => {
    editor.selections = editor.selections.map((selection) => {
      return new vscode.Selection(
        selection.active.with({ character: 0 }),
        positionUtils.lineEnd(editor.document, selection.active),
      );
    });

    enterVisualLineMode(vimState);
    setModeCursorStyle(vimState.mode, editor);
  }),

  parseKeysExact(['S'], [Mode.Normal], (vimState, editor) => {
    editor.selections = editor.selections.map((selection) => {
      return new vscode.Selection(selection.active, positionUtils.lineEnd(editor.document, selection.active));
    });

    enterVisualMode(vimState);
    setModeCursorStyle(vimState.mode, editor);
  }),

  /* parseKeysExact([';'], [Mode.Normal], (vimState, editor) => {
    const active = editor.selection.active;
    editor.selection = new vscode.Selection(active, active);
  }), */
];

function makeMultiLineSelection(
  vimState: HelixState,
  editor: vscode.TextEditor,
  lineCount: number,
  direction: Direction,
): vscode.Selection[] {
  return editor.selections.map((selection) => {
    if (direction == Direction.Up) {
      const endLine = selection.active.line - lineCount + 1;
      const startPos = positionUtils.lineEnd(editor.document, selection.active);
      const endPos = endLine >= 0 ? new vscode.Position(endLine, 0) : new vscode.Position(0, 0);
      return new vscode.Selection(startPos, endPos);
    } else {
      const endLine = selection.active.line + lineCount - 1;
      const startPos = new vscode.Position(selection.active.line, 0);
      const endPos =
        endLine < editor.document.lineCount
          ? new vscode.Position(endLine, editor.document.lineAt(endLine).text.length)
          : positionUtils.lastChar(editor.document);

      return new vscode.Selection(startPos, endPos);
    }
  });
}

function deleteLines(
  vimState: HelixState,
  editor: vscode.TextEditor,
  lineCount: number,
  direction: Direction = Direction.Down,
): void {
  const selections = editor.selections.map((selection) => {
    if (direction == Direction.Up) {
      const endLine = selection.active.line - lineCount;
      if (endLine >= 0) {
        const startPos = positionUtils.lineEnd(editor.document, selection.active);
        const endPos = new vscode.Position(endLine, editor.document.lineAt(endLine).text.length);
        return new vscode.Selection(startPos, endPos);
      } else {
        const startPos =
          selection.active.line + 1 <= editor.document.lineCount
            ? new vscode.Position(selection.active.line + 1, 0)
            : positionUtils.lineEnd(editor.document, selection.active);

        const endPos = new vscode.Position(0, 0);
        return new vscode.Selection(startPos, endPos);
      }
    } else {
      const endLine = selection.active.line + lineCount;
      if (endLine <= editor.document.lineCount - 1) {
        const startPos = new vscode.Position(selection.active.line, 0);
        const endPos = new vscode.Position(endLine, 0);
        return new vscode.Selection(startPos, endPos);
      } else {
        const startPos =
          selection.active.line - 1 >= 0
            ? new vscode.Position(
              selection.active.line - 1,
              editor.document.lineAt(selection.active.line - 1).text.length,
            )
            : new vscode.Position(selection.active.line, 0);

        const endPos = positionUtils.lastChar(editor.document);
        return new vscode.Selection(startPos, endPos);
      }
    }
  });

  editor
    .edit((builder) => {
      selections.forEach((sel) => builder.replace(sel, ''));
    })
    .then(() => {
      editor.selections = editor.selections.map((selection) => {
        const character = editor.document.lineAt(selection.active.line).firstNonWhitespaceCharacterIndex;
        const newPosition = selection.active.with({ character: character });
        return new vscode.Selection(newPosition, newPosition);
      });
    });
}

function deleteLine(vimState: HelixState, editor: vscode.TextEditor, direction: Direction = Direction.Down): void {
  deleteLines(vimState, editor, 1, direction);
}

function yankLine(vimState: HelixState, editor: vscode.TextEditor): void {
  vimState.registers = {
    contentsList: editor.selections.map((selection) => {
      return editor.document.lineAt(selection.active.line).text;
    }),
    linewise: true,
  };
}

export function switchToUppercase(editor: vscode.TextEditor): void {
  editor.edit((editBuilder) => {
    editor.selections.forEach((selection) => {
      const text = editor.document.getText(selection);
      editBuilder.replace(selection, text.toUpperCase());
    });
  });
}

export function incremenet(editor: vscode.TextEditor): void {
  // Move the cursor to the first number and incremene the number
  // If the cursor is not on a number, then do nothing
  editor.edit((editBuilder) => {
    editor.selections.forEach((selection) => {
      const translatedSelection = selection.with(selection.start, selection.start.translate(0, 1));
      const text = editor.document.getText(translatedSelection);
      const number = parseInt(text, 10);
      if (!isNaN(number)) {
        editBuilder.replace(translatedSelection, (number + 1).toString());
      }
    });
  });
}

export function decrement(editor: vscode.TextEditor): void {
  // Move the cursor to the first number and incremene the number
  // If the cursor is not on a number, then do nothing
  editor.edit((editBuilder) => {
    editor.selections.forEach((selection) => {
      const translatedSelection = selection.with(selection.start, selection.start.translate(0, 1));
      const text = editor.document.getText(translatedSelection);
      const number = parseInt(text, 10);
      if (!isNaN(number)) {
        editBuilder.replace(translatedSelection, (number - 1).toString());
      }
    });
  });
}