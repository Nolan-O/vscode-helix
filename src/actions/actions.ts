import * as vscode from 'vscode';
import { Action } from '../action_types';
import { HelixState } from '../helix_state_types';
import {
  ModeEnterFuncs,
  setModeCursorStyle,
  enterPreviousMode
} from '../modes';
import { Mode } from '../modes';
import * as positionUtils from '../position_utils';
import { putAfter } from '../put_utils/put_after';
import { putBefore } from '../put_utils/put_before';
import { removeTypeSubscription, setTypeSubscription } from '../type_subscription';
import { flashYankHighlight } from '../yank_highlight';
import { paragraphBackward, paragraphForward } from '../paragraph_utils';
import { setVisualLineSelections } from '../visual_line_utils';
import { setVisualSelections } from '../visual_utils';
import { toOuterLinewiseSelection, toInnerLinewiseSelection, vscodeToVimVisualSelection } from '../selection_utils';
import { whitespaceWordRanges, wordRanges } from '../word_utils';
import * as scrollCommands from '../scroll_commands';
import * as typeHandlers from '../type_handler';
import * as motions from './motions';
import * as operatorRanges from './operator_ranges';
import * as path from 'path'

export enum Direction {
  Up,
  Down,
  Left,
  Right,
  // Used for h/j/k/l visual motions
  Unknown,
  // Used by yank to derive direction from the order of anchor/active
  // Useful for when no change is happening to the selection
  Auto
}

/**
 * The keys in this table align with helix's command names except for the ones prefixed with vs
 * Some prefixed with vs do not exist in helix at all, but others do actions which helix does but
 * doesn't implement a command for said action e.g. vs_select_paragraph_around
*/
export const actionFuncs: { [key: string]: Action } = {
  no_op: () => { },
  /*
    Modes
  */
  normal_mode: (helixState, editor) => {
    if (helixState.mode === Mode.Insert || helixState.mode === Mode.Occurrence) {
      ModeEnterFuncs[Mode.Normal](helixState);
      setModeCursorStyle(helixState.mode, editor);
      setTypeSubscription(helixState, typeHandlers.typeHandler);
    } else if (helixState.mode === Mode.Normal) {
      // Clear multiple cursors
      if (editor.selections.length > 1) {
        editor.selections = [editor.selections[0]];
      }
      // There is no way to check if find widget is open, so just close it
      vscode.commands.executeCommand('closeFindWidget');
    } else if (helixState.mode === Mode.Visual) {

      ModeEnterFuncs[Mode.Normal](helixState);
      setModeCursorStyle(helixState.mode, editor);
    } else if (helixState.mode === Mode.VisualLine) {
      editor.selections = editor.selections.map((selection) => {
        const newPosition = selection.active.with({
          character: Math.max(selection.active.character - 1, 0),
        });
        return new vscode.Selection(newPosition, newPosition);
      });

      ModeEnterFuncs[Mode.Normal](helixState);
      setModeCursorStyle(helixState.mode, editor);
    } else if (helixState.mode === Mode.SearchInProgress || helixState.mode === Mode.Select) {
      ModeEnterFuncs[Mode.Normal](helixState);
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
    } else {
      ModeEnterFuncs[Mode.Normal](helixState);
    }

    helixState.keysPressed = [];
  },
  vscode_mode: (helixState, editor) => {
    ModeEnterFuncs[Mode.VSCode](helixState);
    setModeCursorStyle(helixState.mode, editor);
  },
  select_mode: (vimState, editor) => {
    ModeEnterFuncs[Mode.Visual](vimState);
    setModeCursorStyle(vimState.mode, editor);
  },
  insert_mode: (vimState, editor) => {
    editor.selections = editor.selections.map((selection) => {
      return new vscode.Selection(selection.start, selection.start);
    });

    ModeEnterFuncs[Mode.Insert](vimState);
    setModeCursorStyle(vimState.mode, editor);
    removeTypeSubscription(vimState);
  },
  append_mode: (vimState, editor) => {
    editor.selections = editor.selections.map((selection) => {
      let newPosition = selection.end
      if (selection.anchor.compareTo(selection.active) <= 0)
        newPosition = positionUtils.rightWrap(editor.document, selection.end);

      return new vscode.Selection(newPosition, newPosition);
    });

    ModeEnterFuncs[Mode.Insert](vimState, false);
    setModeCursorStyle(vimState.mode, editor);
    removeTypeSubscription(vimState);
  },
  vs_window_mode: (helixState) => {
    ModeEnterFuncs[Mode.Window](helixState);
  },
  vs_view_mode: (helixState) => {
    ModeEnterFuncs[Mode.View](helixState);
  },
  vs_match_mode: (helixState) => {
    ModeEnterFuncs[Mode.Match](helixState);
  },
  command_mode: (helixState, editor) => {
    vscode.window.showQuickPick(actionNames, { canPickMany: false }).then((str) => {
      enterPreviousMode(helixState);

      if (str === undefined)
        return;

      const action = actionFuncs[str];
      if (action !== undefined) {
        action(helixState, editor);
      }
    })
  },
  select_regex: (helixState, editor) => {
    ModeEnterFuncs[Mode.Select](helixState);
    // if we enter select mode we should save the current selection
    helixState.currentSelection = editor.selection;
  },
  extend_line_below: (vimState: HelixState, editor) => {
    editor.selections = editor.selections.map((sel => {
      let end_line_length = editor.document.lineAt(sel.end.line).text.length
      let start = sel.start
      let end = sel.end

      // Detect if we are either on a blank line or if the line is already selected fully
      if (end.character === end_line_length && (end_line_length === 0 || start.character === 0)) {
        end_line_length = editor.document.lineAt(end.line + 1).text.length
        end = new vscode.Position(end.line + 1, end_line_length)
      } else {
        end = new vscode.Position(end.line, end_line_length)
      }

      return new vscode.Selection(
        new vscode.Position(start.line, 0),
        end,
      )
    }))
  },
  extend_to_line_bounds: (vimState: HelixState, editor) => {
    editor.selections = editor.selections.map((sel => {
      return toOuterLinewiseSelection(editor.document, sel)
    }))
  },
  shrink_to_line_bounds: (vimState: HelixState, editor) => {
    editor.selections = editor.selections.map((sel => {
      return toInnerLinewiseSelection(editor.document, sel)
    }))
  },
  search: (helixState) => {
    ModeEnterFuncs[Mode.SearchInProgress](helixState);
  },
  rsearch: (helixState) => {
    ModeEnterFuncs[Mode.SearchInProgress](helixState);
    helixState.searchState.previousSearchResult(helixState);
  },
  search_next: (helixState) => {
    if (helixState.mode === Mode.Visual) {
      vscode.commands.executeCommand('editor.action.addSelectionToNextFindMatch');
    } else {
      vscode.commands.executeCommand('editor.action.nextMatchFindAction');
    }
  },
  search_prev: (helixState) => {
    if (helixState.mode === Mode.Visual) {
      vscode.commands.executeCommand('editor.action.addSelectionToPreviousFindMatch');
    } else {
      vscode.commands.executeCommand('editor.action.previousMatchFindAction');
    }
  },
  select_all: (helixState) => {
    vscode.commands.executeCommand('editor.action.selectAll');
  },
  search_selection: (helixState) => {
    if (helixState.searchState.selectModeActive) {
      vscode.commands.executeCommand('actions.findWithSelection');
      helixState.searchState.selectModeActive = false;
      return;
    }
  },
  split_selection_on_newline: (helixState, editor) => {
    let selections = []
    for (const sel of editor.selections) {
      for (let i = sel.start.line; i <= sel.end.line; i++) {
        if (i === sel.start.line) {
          const lineLen = editor.document.lineAt(i).text.length;
          selections.push(
            new vscode.Selection(
              sel.start,
              sel.start.with({ character: lineLen - 1 })
            )
          )
        } else if (i === sel.end.line) {
          selections.push(
            new vscode.Selection(
              sel.end.with({ character: 0 }),
              sel.end.translate({ characterDelta: -1 })
            )
          )
        } else {
          const lineLen = editor.document.lineAt(i).text.length;
          selections.push(
            new vscode.Selection(
              new vscode.Position(i, 0),
              new vscode.Position(i, (lineLen - 1 < 0 ? 0 : lineLen - 1))
            )
          )
        }
      }
    }

    editor.selections = selections
  },
  flip_selections: (helixState, editor) => {
    editor.selections = editor.selections.map((selection) => {
      return new vscode.Selection(selection.active, selection.anchor);
    });
  },
  ensure_selections_forward: (helixState, editor) => {
    editor.selections = editor.selections.map((selection) => {
      return new vscode.Selection(selection.start, selection.end);
    });
  },
  insert_at_line_start: (vimState, editor) => {
    editor.selections = editor.selections.map((selection) => {
      const character = editor.document.lineAt(selection.active.line).firstNonWhitespaceCharacterIndex;
      const newPosition = selection.active.with({ character: character });
      return new vscode.Selection(newPosition, newPosition);
    });

    ModeEnterFuncs[Mode.Insert](vimState);
    setModeCursorStyle(vimState.mode, editor);
    removeTypeSubscription(vimState);
  },
  insert_at_line_end: (vimState, editor) => {
    editor.selections = editor.selections.map((selection) => {
      const lineLength = editor.document.lineAt(selection.active.line).text.length;
      const newPosition = selection.active.with({ character: lineLength });
      return new vscode.Selection(newPosition, newPosition);
    });

    ModeEnterFuncs[Mode.Insert](vimState);
    setModeCursorStyle(vimState.mode, editor);
    removeTypeSubscription(vimState);
  },
  keep_primary_selection: (_, editor) => {
    // Keep primary selection only
    editor.selections = editor.selections.slice(0, 1);
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
    ModeEnterFuncs[Mode.Insert](vimState);
    vscode.commands.executeCommand('editor.action.insertLineAfter');
    setModeCursorStyle(vimState.mode, editor);
    removeTypeSubscription(vimState);
  },
  open_above: (vimState, editor) => {
    ModeEnterFuncs[Mode.Insert](vimState);
    vscode.commands.executeCommand('editor.action.insertLineBefore');
    setModeCursorStyle(vimState.mode, editor);
    removeTypeSubscription(vimState);
  },
  paste_after: putAfter,
  paste_before: putBefore,
  paste_clipboard_after: (vimState, editor) => {
    putAfter(vimState, editor, true);
  },
  paste_clipboard_before: (vimState, editor) => {
    putBefore(vimState, editor, true);
  },
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
  vs_move_editor_right: (helixState) => {
    vscode.commands.executeCommand('workbench.action.moveEditorToNextGroup');
    ModeEnterFuncs[Mode.Normal](helixState);
  },
  vs_move_editor_down: (helixState) => {
    vscode.commands.executeCommand('workbench.action.moveEditorToBelowGroup');
    ModeEnterFuncs[Mode.Normal](helixState);
  },
  vs_move_editor_up: (helixState) => {
    vscode.commands.executeCommand('workbench.action.moveEditorToAboveGroup');
    ModeEnterFuncs[Mode.Normal](helixState);
  },
  vs_move_editor_left: (helixState) => {
    vscode.commands.executeCommand('workbench.action.moveEditorToPreviousGroup');
    ModeEnterFuncs[Mode.Normal](helixState);
  },
  vs_move_editor_new_window: (helixState) => {
    vscode.commands.executeCommand('workbench.action.moveEditorToNewWindow');
    ModeEnterFuncs[Mode.Normal](helixState);
  },
  vs_move_editor_main_window: (helixState) => {
    vscode.commands.executeCommand('workbench.action.restoreEditorsToMainWindow');
    ModeEnterFuncs[Mode.Normal](helixState);
  },
  yank_to_clipboard: (vimState, editor) => {
    yank(vimState, editor, false, true);

    // Yank highlight
    const highlightRanges = editor.selections.map((selection) => {
      const vimSelection = vscodeToVimVisualSelection(editor.document, selection, Direction.Auto);
      return new vscode.Range(
        vimSelection.anchor,
        vimSelection.active,
      );
    });
    flashYankHighlight(editor, highlightRanges);
  },
  yank: (vimState, editor) => {
    yank(vimState, editor, false);

    // Yank highlight
    const highlightRanges = editor.selections.map((selection) => {
      const vimSelection = vscodeToVimVisualSelection(editor.document, selection, Direction.Auto);
      return new vscode.Range(
        vimSelection.anchor,
        vimSelection.active,
      );
    });
    flashYankHighlight(editor, highlightRanges);
  },

  /*
    Window actions
  */
  rotate_view: (helixState) => {
    vscode.commands.executeCommand('workbench.action.navigateEditorGroups');
    ModeEnterFuncs[Mode.Normal](helixState);
  },
  vsplit: (helixState) => {
    vscode.commands.executeCommand('workbench.action.splitEditor');
    ModeEnterFuncs[Mode.Normal](helixState);
  },
  hsplit: (helixState) => {
    vscode.commands.executeCommand('workbench.action.splitEditorDown');
    ModeEnterFuncs[Mode.Normal](helixState);
  },
  // maps to ctrl w f & ctrl w shift f since this is the only suitable replacement for both vscode.commands in helix
  goto_file: (helixState) => {
    vscode.commands.executeCommand('editor.action.revealDefinitionAside');
    ModeEnterFuncs[Mode.Normal](helixState);
  },
  jump_view_left: (helixState) => {
    vscode.commands.executeCommand('workbench.action.focusLeftGroup');
    ModeEnterFuncs[Mode.Normal](helixState);
  },
  jump_view_right: (helixState) => {
    vscode.commands.executeCommand('workbench.action.focusRightGroup');
    ModeEnterFuncs[Mode.Normal](helixState);
  },
  jump_view_down: (helixState) => {
    vscode.commands.executeCommand('workbench.action.focusBelowGroup');
    ModeEnterFuncs[Mode.Normal](helixState);
  },
  jump_view_up: (helixState) => {
    vscode.commands.executeCommand('workbench.action.focusAboveGroup');
    ModeEnterFuncs[Mode.Normal](helixState);
  },
  wclose: (helixState) => {
    vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    ModeEnterFuncs[Mode.Normal](helixState);
  },
  wonly: (helixState) => {
    vscode.commands.executeCommand('workbench.action.closeOtherEditors');
    ModeEnterFuncs[Mode.Normal](helixState);
  },
  swap_view_left: (helixState) => {
    vscode.commands.executeCommand('workbench.action.moveActiveEditorGroupLeft');
    ModeEnterFuncs[Mode.Normal](helixState);
  },
  swap_view_right: (helixState) => {
    vscode.commands.executeCommand('workbench.action.moveActiveEditorGroupRight');
    ModeEnterFuncs[Mode.Normal](helixState);
  },
  swap_view_up: (helixState) => {
    vscode.commands.executeCommand('workbench.action.moveActiveEditorGroupUp');
    ModeEnterFuncs[Mode.Normal](helixState);
  },
  swap_view_down: (helixState) => {
    vscode.commands.executeCommand('workbench.action.moveActiveEditorGroupDown');
    ModeEnterFuncs[Mode.Normal](helixState);
  },
  new_file: (helixState) => {
    vscode.commands.executeCommand('workbench.action.files.newUntitledFile');
    ModeEnterFuncs[Mode.Normal](helixState);
  },
  vs_toggle_sidebar_visibility: (helixState) => {
    vscode.commands.executeCommand('workbench.action.toggleSidebarVisibility');
    ModeEnterFuncs[Mode.Normal](helixState);
  },
  vs_search_with_selection: (_) => {
    vscode.commands.executeCommand('actions.findWithSelection');
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
    if (helixState.mode === Mode.Visual) {
      vscode.commands.executeCommand('cursorBottomSelect');
    } else {
      vscode.commands.executeCommand('cursorBottom');
    }
  },

  goto_line_start: (helixState) => {
    if (helixState.mode === Mode.Visual) {
      vscode.commands.executeCommand('cursorLineStartSelect');
    } else {
      vscode.commands.executeCommand('cursorLineStart');
    }
  },
  goto_line_end: (helixState) => {
    if (helixState.mode === Mode.Visual) {
      vscode.commands.executeCommand('cursorLineEndSelect');
    } else {
      vscode.commands.executeCommand('cursorLineEnd');
    }
  },
  goto_first_nonwhitespace: (helixState) => {
    if (helixState.mode === Mode.Visual) {
      vscode.commands.executeCommand('cursorHomeSelect');
    } else {
      vscode.commands.executeCommand('cursorHome');
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
  page_up: (helixState) => {
    if (helixState.mode === Mode.Visual) {
      vscode.commands.executeCommand('cursorPageUpSelect');
    } else if (helixState.mode === Mode.View) {
      // Deviation: doing both a scroll and cursor move command by whole pages at once produces
      // effects difficult to discern. As an alternative, view mode pageup simply scrolls viewport
      scrollCommands.scrollUpPage();
      enterPreviousMode(helixState);
    } else {
      vscode.commands.executeCommand('cursorPageUp');
    }
  },
  page_down: (helixState) => {
    if (helixState.mode === Mode.Visual) {
      vscode.commands.executeCommand('cursorPageDownSelect');
    } else if (helixState.mode === Mode.View) {
      // Deviation: doing both a scroll and cursor move command by whole pages at once produces
      // effects difficult to discern. As an alternative, view mode pagedown simply scrolls viewport
      scrollCommands.scrollDownPage();
      enterPreviousMode(helixState);
    } else {
      vscode.commands.executeCommand('cursorPageDown');
    }
  },
  page_cursor_half_up: (helixState) => {
    if (helixState.mode === Mode.View)
      enterPreviousMode(helixState);

    scrollCommands.scrollUpHalfPage();
  },
  page_cursor_half_down: (helixState) => {
    if (helixState.mode === Mode.View)
      enterPreviousMode(helixState);

    scrollCommands.scrollDownHalfPage();
  },
  jump_forward: (helixState) => {
    vscode.commands.executeCommand('workbench.action.navigateForward');
  },
  jump_backward: (helixState) => {
    vscode.commands.executeCommand('workbench.action.navigateBack');
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
  // Deviation: helix *seems* to do the same thing as normal file picker for this
  // but this is a cool feature and we should make it work
  file_picker_in_current_directory: (helixState, editor) => {
    const documentFolder = path.dirname(editor.document.uri.path)
    const wsFolder = vscode.workspace.getWorkspaceFolder(editor.document.uri)

    if (wsFolder && documentFolder) {
      let prefix
      try { prefix = path.relative(wsFolder.uri.path, documentFolder) } catch { return }
      vscode.commands.executeCommand('workbench.action.quickOpen', prefix);
    } else {
      // fallback to normal file picker
      vscode.commands.executeCommand('workbench.action.quickOpen', "index.js");
    }
  },
  vs_debug_view: () => {
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
  match_brackets: (helixState, editor) => {
    enterPreviousMode(helixState);

    if (helixState.mode === Mode.Visual || helixState.mode === Mode.VisualLine) {
      vscode.commands.executeCommand('editor.action.selectToBracket');
    } else {
      vscode.commands.executeCommand('editor.action.jumpToBracket');
    }
  },
  surround_add: (helixState, editor) => {
    ModeEnterFuncs[Mode.InputGathering](helixState, typeHandlers.surroundAddTypeHandler);
  },
  surround_replace: (helixState, editor) => {
    ModeEnterFuncs[Mode.InputGathering](helixState, typeHandlers.surroundReplaceTypeHandler);
  },
  surround_delete: (helixState, editor) => {
    ModeEnterFuncs[Mode.InputGathering](helixState, typeHandlers.surroundDeleteTypeHandler);
  },

  delete_char_backward: (helixState, editor) => {
    const document = vscode.window.activeTextEditor?.document;
    if (document == undefined) return;
    const ranges = editor.selections.map((selection) => selection.with(undefined, positionUtils.leftWrap(document, selection.anchor)));
    delete_(editor, ranges, false);
  },
  delete_char_forward: (helixState, editor) => {
    const document = vscode.window.activeTextEditor?.document;
    if (document == undefined) return;
    const ranges = editor.selections.map((selection) => selection.with(undefined, positionUtils.rightWrap(document, selection.anchor)));
    delete_(editor, ranges, false);
  },
  vs_search_backspace: (helixState, editor) => {
    helixState.searchState.backspace(helixState)
  },
  vs_search_paste: (helixState, editor) => {
    vscode.env.clipboard.readText().then((text: string) => {
      helixState.searchState.addText(helixState, text)
    })
  },

  delete_word_backward: (helixState, editor) => {
    vscode.commands.executeCommand('deleteWordLeft');
  },
  delete_word_forward: (helixState, editor) => {
    vscode.commands.executeCommand('deleteWordRight');
  },
  completion: () => {
    vscode.commands.executeCommand("editor.action.triggerSuggest");
  },

  repeat_last_motion: (helixState) => {
    helixState.repeatLastMotion(helixState, vscode.window.activeTextEditor!);
  },

  incriment: () => {
    const editor = vscode.window.activeTextEditor
    if (editor == undefined) return;

    // Move the cursor to the first number and incremene the number
    // If the cursor is not on a number, then do nothing
    editor.edit((editBuilder) => {
      editor.selections.forEach((selection) => {
        const translatedSelection = selection.with(selection.active, selection.active.translate(0, 1));
        const text = editor.document.getText(translatedSelection);
        const number = parseInt(text, 10);
        if (!isNaN(number)) {
          editBuilder.replace(translatedSelection, (number + 1).toString());
        }
      });
    });
  },
  decriment: () => {
    const editor = vscode.window.activeTextEditor
    if (editor == undefined) return;

    // Move the cursor to the first number and incremene the number
    // If the cursor is not on a number, then do nothing
    editor.edit((editBuilder) => {
      editor.selections.forEach((selection) => {
        const translatedSelection = selection.with(selection.active, selection.active.translate(0, 1));
        const text = editor.document.getText(translatedSelection);
        const number = parseInt(text, 10);
        if (!isNaN(number)) {
          editBuilder.replace(translatedSelection, (number - 1).toString())
        }
      });
    });
  },

  // Selection commands for match mode which, while making up individual actions, do not have individual helix bindings
  vs_select_paragraph_around: (vimState, editor) => {
    operatorRanges.outer.Paragraph(vimState, editor)
    enterPreviousMode(vimState)
  },
  vs_select_word_around: (helixState, editor) => {
    operatorRanges.outer.Word(helixState, editor)
    enterPreviousMode(helixState)
  },
  vs_select_longword_around: (helixState, editor) => {
    operatorRanges.outer.LongWord(helixState, editor)
    enterPreviousMode(helixState)
  },
  vs_select_pair_around: (helixState, editor) => {
    operatorRanges.outer.SurroundingPair(helixState, editor)
    enterPreviousMode(helixState)
  },
  vs_select_function_around: (helixState, editor) => {
    operatorRanges.outer.Function(helixState, editor)
    enterPreviousMode(helixState)
  },
  vs_select_type_around: (helixState, editor) => {
    operatorRanges.outer.Type(helixState, editor)
    enterPreviousMode(helixState)
  },
  vs_select_paragraph_inner: (vimState, editor) => {
    operatorRanges.inner.Paragraph(vimState, editor)
    enterPreviousMode(vimState)
  },
  vs_select_word_inner: (helixState, editor) => {
    operatorRanges.inner.Word(helixState, editor)
    enterPreviousMode(helixState)
  },
  vs_select_longword_inner: (helixState, editor) => {
    operatorRanges.inner.LongWord(helixState, editor)
    enterPreviousMode(helixState)
  },
  vs_select_pair_inner: (helixState, editor) => {
    operatorRanges.inner.SurroundingPair(helixState, editor)
    enterPreviousMode(helixState)
  },
  vs_select_function_inner: (helixState, editor) => {
    operatorRanges.inner.Function(helixState, editor)
    enterPreviousMode(helixState)
  },
  vs_select_type_inner: (helixState, editor) => {
    operatorRanges.inner.Type(helixState, editor)
    enterPreviousMode(helixState)
  },

  move_char_right: (vimState, editor) => {
    if (vimState.mode === Mode.Visual) {
      motions.execMotion(vimState, editor, ({ document, position }) => {
        return positionUtils.rightWrap(document, position);
      }, Direction.Unknown);
    } else {
      vscode.commands.executeCommand('cursorRight');
    }
  },
  move_char_left: (vimState, editor) => {
    if (vimState.mode === Mode.Visual) {
      motions.execMotion(vimState, editor, ({ document, position }) => {
        return positionUtils.leftWrap(document, position);
      }, Direction.Unknown);
    } else {
      vscode.commands.executeCommand('cursorLeft');
    }
  },
  move_visual_line_up: (vimState, editor) => {
    if (vimState.mode === Mode.Visual) {
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
    } else {
      vscode.commands.executeCommand('cursorMove', {
        to: 'up',
        by: 'wrappedLine',
        value: vimState.resolveCount(),
      });
    }
  },
  move_visual_line_down: (vimState, editor) => {
    if (vimState.mode === Mode.Visual) {
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
    } else {
      vscode.commands.executeCommand('cursorMove', {
        to: 'down',
        by: 'wrappedLine',
        value: vimState.resolveCount(),
      });
    }
  },

  move_next_word_start: motions.createWordForwardHandler(wordRanges),
  move_next_long_word_start: motions.createWordForwardHandler(whitespaceWordRanges),
  move_prev_word_start: motions.createWordBackwardHandler(wordRanges),
  move_prev_long_word_start: motions.createWordBackwardHandler(whitespaceWordRanges),
  move_next_word_end: motions.createWordEndHandler(wordRanges, Direction.Right),
  move_next_long_word_end: motions.createWordEndHandler(whitespaceWordRanges, Direction.Right),

  goto_next_paragraph: (vimState, editor) => {
    motions.execMotion(vimState, editor, ({ document, position }) => {
      return new vscode.Position(paragraphForward(document, position.line), 0);
    }, Direction.Right);
  },
  goto_prev_paragraph: (vimState, editor) => {
    motions.execMotion(vimState, editor, ({ document, position }) => {
      return new vscode.Position(paragraphBackward(document, position.line), 0);
    }, Direction.Left);
  },
  goto_window_top: (vimState, editor) => {
    if (vimState.mode === Mode.Visual) {
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
    } else {
      vscode.commands.executeCommand('cursorMove', {
        to: 'viewPortTop',
        by: 'line',
      });
    }
  },
  goto_window_center: (vimState, editor) => {
    if (vimState.mode === Mode.Visual) {
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
    } else {
      vscode.commands.executeCommand('cursorMove', {
        to: 'viewPortCenter',
        by: 'line',
      });
    }
  },
  goto_window_bottom: (vimState, editor) => {
    if (vimState.mode === Mode.Visual) {
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
    } else {
      vscode.commands.executeCommand('cursorMove', {
        to: 'viewPortBottom',
        by: 'line',
      });
    }
  },

  align_view_center: (helixState, editor) => {
    const line = editor.selection.active.line;
    const char = editor.selection.active.character;
    vscode.commands.executeCommand('cursorMove', {
      to: 'viewPortCenter',
    }).then(() => {
      const delta = line - editor.selection.active.line;
      if (delta === 0)
        return;

      vscode.commands.executeCommand('editorScroll', {
        to: "down",
        by: "line",
        value: delta
      })

      editor.selection = new vscode.Selection(
        new vscode.Position(line, char),
        new vscode.Position(line, char)
      )
    });

    if (helixState.mode === Mode.View)
      enterPreviousMode(helixState);
  },
  align_view_top: (helixState, editor) => {
    const line = editor.selection.active.line;
    const char = editor.selection.active.character;
    vscode.commands.executeCommand('cursorMove', {
      to: 'viewPortTop',
    }).then(() => {
      const delta = line - editor.selection.active.line;
      if (delta === 0)
        return;

      vscode.commands.executeCommand('editorScroll', {
        to: "down",
        by: "line",
        value: delta
      })

      editor.selection = new vscode.Selection(
        new vscode.Position(line, char),
        new vscode.Position(line, char)
      )
    });

    if (helixState.mode === Mode.View)
      enterPreviousMode(helixState);
  },
  align_view_bottom: (helixState, editor) => {
    const line = editor.selection.active.line;
    const char = editor.selection.active.character;
    vscode.commands.executeCommand('cursorMove', {
      to: 'viewPortBottom',
    }).then(() => {
      const delta = line - editor.selection.active.line;
      if (delta === 0)
        return;

      vscode.commands.executeCommand('editorScroll', {
        to: "down",
        by: "line",
        value: delta
      })

      editor.selection = new vscode.Selection(
        new vscode.Position(line, char),
        new vscode.Position(line, char)
      )
    });

    if (helixState.mode === Mode.View)
      enterPreviousMode(helixState);
  },
  scroll_down: (helixState, editor) => {
    const delta = helixState.resolveCount();
    vscode.commands.executeCommand('editorScroll', {
      to: "down",
      by: "line",
      value: delta
    });

    if (helixState.mode === Mode.View)
      enterPreviousMode(helixState);
  },
  scroll_up: (helixState, editor) => {
    const delta = helixState.resolveCount();
    vscode.commands.executeCommand('editorScroll', {
      to: "up",
      by: "line",
      value: delta
    });

    if (helixState.mode === Mode.View)
      enterPreviousMode(helixState);
  },

  find_till_char: (helixState, editor) => {
    ModeEnterFuncs[Mode.Find](helixState, motions.tillForward);
  },
  till_prev_char: (helixState, editor) => {
    ModeEnterFuncs[Mode.Find](helixState, motions.tillBackward);
  },
  find_next_char: (helixState, editor) => {
    ModeEnterFuncs[Mode.Find](helixState, motions.findForward);
  },
  find_prev_char: (helixState, editor) => {
    ModeEnterFuncs[Mode.Find](helixState, motions.findBackward);
  },
  delete_selection_noyank: async (vimState, editor) => {
    await editor.edit((builder) => {
      editor.selections = editor.selections.map((sel, i) => {
        const new_sel = vscodeToVimVisualSelection(editor.document, sel, Direction.Auto)
        builder.replace(new_sel, '')
        return new vscode.Selection(new_sel.start, new_sel.start)
      });
    })
  },
  delete_selection: (vimState, editor) => {
    yank(vimState, editor, false);
    actionFuncs.delete_selection_noyank(vimState, editor);
  },
  replace: (vimState, editor) => {
    ModeEnterFuncs[Mode.Replace](vimState);
  },
  replace_with_yanked: async (vimState, editor) => {
    await actionFuncs.delete_selection_noyank(vimState, editor);
    actionFuncs.paste_before(vimState, editor);
  },
  replace_selections_with_clipboard: async (vimState, editor) => {
    await actionFuncs.delete_selection_noyank(vimState, editor);
    actionFuncs.paste_clipboard_before(vimState, editor);
  },
  change_selection: (helixState, editor) => {
    yank(helixState, editor, false);

    actionFuncs.change_selection_noyank(helixState, editor);
  },
  change_selection_noyank: (helixState, editor) => {
    editor.edit((editBuilder) => {
      editor.selections.forEach((selection) => {
        editBuilder.delete(vscodeToVimVisualSelection(editor.document, selection, Direction.Auto));
      });
    });

    ModeEnterFuncs[Mode.Insert](helixState);
  },

  kill_to_line_end: () => {
    vscode.commands.executeCommand('deleteAllRight');
  },
  kill_to_line_start: () => {
    vscode.commands.executeCommand('deleteAllLeft');
  },

  join_selections: (helixState, editor) => {
    editor.edit((editBuilder) => {
      editor.selections.forEach((selection) => {
        let text = editor.document.getText(selection);
        text = text.replace(new RegExp('\r?\n', 'g'), "")
        editBuilder.replace(selection, text)
      })
    })
  },
  expand_selection: () => {
    vscode.commands.executeCommand('editor.action.smartSelect.expand');
  },
  shrink_selection: () => {
    vscode.commands.executeCommand('editor.action.smartSelect.shrink');
  }
}

const actionNames: string[] = []

for (const key in actionFuncs) {
  actionNames.push(key);
  actionNames.sort();
}

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

function cursorsToRangesStart(editor: vscode.TextEditor, ranges: readonly (vscode.Range | undefined)[]) {
  editor.selections = editor.selections.map((selection, i) => {
    const range = ranges[i];

    if (range) {
      const newPosition = range.start;
      return new vscode.Selection(newPosition, newPosition);
    } else {
      return selection;
    }
  });
}

export function delete_(editor: vscode.TextEditor, ranges: (vscode.Range | undefined)[], linewise: boolean) {
  if (ranges.length === 1 && ranges[0] && isEmptyRange(ranges[0])) {
    vscode.commands.executeCommand('deleteRight');
    return;
  }

  editor
    .edit((editBuilder) => {
      ranges.forEach((range) => {
        if (!range) return;

        let deleteRange = range;

        if (linewise) {
          const start = range.start;
          const end = range.end;

          if (end.line === editor.document.lineCount - 1) {
            if (start.line === 0) {
              deleteRange = new vscode.Range(start.with({ character: 0 }), end);
            } else {
              deleteRange = new vscode.Range(
                new vscode.Position(start.line - 1, editor.document.lineAt(start.line - 1).text.length),
                end,
              );
            }
          } else {
            deleteRange = new vscode.Range(range.start, new vscode.Position(end.line + 1, 0));
          }
        }

        editBuilder.delete(deleteRange);
      });
    })
    .then(() => {
      // For linewise deletions, make sure cursor is at beginning of line
      editor.selections = editor.selections.map((selection, i) => {
        const range = ranges[i];

        if (range && linewise) {
          const newPosition = selection.start.with({ character: 0 });
          return new vscode.Selection(newPosition, newPosition);
        } else {
          return selection;
        }
      });
    });
}

export function yank(
  vimState: HelixState,
  editor: vscode.TextEditor,
  linewise: boolean,
  clipboard: boolean = false,
) {
  let text_arr = editor.selections.map((sel, i) => {
    if (linewise)
      return editor.document.getText(toOuterLinewiseSelection(editor.document, sel))
    else {
      return editor.document.getText(vscodeToVimVisualSelection(editor.document, sel, Direction.Auto))
    }
  })

  if (clipboard) {
    let text = text_arr.join('')
    vscode.env.clipboard.writeText(text)
  } else {
    vimState.registers = {
      contentsList: text_arr,
      linewise: linewise
    }
  }
}

// detect if a range is covering just a single character
function isEmptyRange(range: vscode.Range) {
  return range.start.line === range.end.line && range.start.character === range.end.character;
}

// detect if the range spans a whole line and only one line
// Theres a weird issue where the cursor jumps to the next line when doing expand line selection
// https://github.com/microsoft/vscode/issues/118015#issuecomment-854964022
export function isSingleLineRange(range: vscode.Range): boolean {
  return range.start.line === range.end.line && range.start.character === 0 && range.end.character === 0;
}