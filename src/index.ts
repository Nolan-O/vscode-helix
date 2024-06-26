import * as vscode from 'vscode';
import { commands } from 'vscode';

import { symbolProvider } from './SymbolProvider';
import { commandLine } from './commandLine';
import { escapeHandler } from './escape_handler';
import { onDidChangeActiveTextEditor, onDidChangeTextDocument } from './eventHandlers';
import { HelixState } from './helix_state_types';
import { ModeEnterFuncs, setModeCursorStyle } from './modes';
import { Mode } from './modes';
import { searchState } from './search';
import { flipSelection } from './selection_utils';
import { typeHandler } from './type_handler';
import { setTypeSubscription, removeTypeSubscription } from './type_subscription';
import * as bindings from './bindings';
import * as config from './config';

const globalhelixState: HelixState = {
  typeSubscriptionDisposable: undefined,
  typeSubscription: typeHandler,
  mode: Mode.Insert,
  keysPressed: [],
  numbersPressed: [],
  resolveCount: function () {
    // We can resolve this lazily as not every function will need it
    // So we don't want it running on every keystroke or every command
    return parseInt(this.numbersPressed.join(''), 10) || 1;
  },
  registers: {
    contentsList: [],
    linewise: true,
  },
  symbolProvider,
  editorState: {
    activeEditor: undefined,
    previousEditor: undefined,
    lastModifiedDocument: undefined,
  },
  commandLine,
  commandContents: '',
  searchState,
  currentSelection: null,
  repeatLastMotion: () => undefined,
  motionForMode: null,
  previousMode: undefined,
  lastPutRanges: {
    ranges: [],
    linewise: true,
  },
};

function pushKP(strs: string[]) {
  for (const str of strs) {
    globalhelixState.keysPressed.push(str);
  }
}

/** This is the main entry point into the Helix VSCode extension */
export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    // vscode.window.onDidChangeTextEditorSelection((e) => onSelectionChange(globalhelixState, e)),
    vscode.window.onDidChangeActiveTextEditor((editor) => onDidChangeActiveTextEditor(globalhelixState, editor)),
    vscode.workspace.onDidChangeTextDocument((e) => onDidChangeTextDocument(globalhelixState, e)),
    vscode.commands.registerCommand('extension.helixKeymap.escapeKey', () => escapeHandler(globalhelixState)),

    // vscode doesn't let us bind to modifier keys, hook them, pass through commands in any form, query key states, or dyanmically decide bindings' keys
    // so we get to do this instead :~)
    commands.registerCommand('extension.helixKeymap.pageup', () => {
      globalhelixState.typeSubscription(globalhelixState, 'pageup');
    }),
    commands.registerCommand('extension.helixKeymap.pagedown', () => {
      globalhelixState.typeSubscription(globalhelixState, 'pagedown');
    }),
    commands.registerCommand('extension.helixKeymap.home', () => {
      globalhelixState.typeSubscription(globalhelixState, 'home');
    }),
    commands.registerCommand('extension.helixKeymap.end', () => {
      globalhelixState.typeSubscription(globalhelixState, 'end');
    }),
    commands.registerCommand('extension.helixKeymap.escape', () => {
      globalhelixState.typeSubscription(globalhelixState, 'escape');
    }),
    commands.registerCommand('extension.helixKeymap.backspace', () => {
      globalhelixState.typeSubscription(globalhelixState, 'backspace');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_a', () => {
      pushKP(['ctrl']);
      globalhelixState.typeSubscription(globalhelixState, 'a');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_b', () => {
      pushKP(['ctrl']);
      globalhelixState.typeSubscription(globalhelixState, 'b');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_c', () => {
      pushKP(['ctrl']);
      globalhelixState.typeSubscription(globalhelixState, 'c');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_d', () => {
      pushKP(['ctrl']);
      globalhelixState.typeSubscription(globalhelixState, 'd');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_e', () => {
      pushKP(['ctrl']);
      globalhelixState.typeSubscription(globalhelixState, 'e');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_f', () => {
      pushKP(['ctrl']);
      globalhelixState.typeSubscription(globalhelixState, 'f');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_g', () => {
      pushKP(['ctrl']);
      globalhelixState.typeSubscription(globalhelixState, 'g');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_h', () => {
      pushKP(['ctrl']);
      globalhelixState.typeSubscription(globalhelixState, 'h');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_i', () => {
      pushKP(['ctrl']);
      globalhelixState.typeSubscription(globalhelixState, 'i');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_j', () => {
      pushKP(['ctrl']);
      globalhelixState.typeSubscription(globalhelixState, 'j');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_k', () => {
      pushKP(['ctrl']);
      globalhelixState.typeSubscription(globalhelixState, 'k');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_l', () => {
      pushKP(['ctrl']);
      globalhelixState.typeSubscription(globalhelixState, 'l');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_m', () => {
      pushKP(['ctrl']);
      globalhelixState.typeSubscription(globalhelixState, 'm');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_n', () => {
      pushKP(['ctrl']);
      globalhelixState.typeSubscription(globalhelixState, 'n');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_o', () => {
      pushKP(['ctrl']);
      globalhelixState.typeSubscription(globalhelixState, 'o');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_p', () => {
      pushKP(['ctrl']);
      globalhelixState.typeSubscription(globalhelixState, 'p');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_q', () => {
      pushKP(['ctrl']);
      globalhelixState.typeSubscription(globalhelixState, 'q');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_r', () => {
      pushKP(['ctrl']);
      globalhelixState.typeSubscription(globalhelixState, 'r');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_s', () => {
      pushKP(['ctrl']);
      globalhelixState.typeSubscription(globalhelixState, 's');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_t', () => {
      pushKP(['ctrl']);
      globalhelixState.typeSubscription(globalhelixState, 't');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_u', () => {
      pushKP(['ctrl']);
      globalhelixState.typeSubscription(globalhelixState, 'u');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_v', () => {
      pushKP(['ctrl']);
      globalhelixState.typeSubscription(globalhelixState, 'v');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_w', () => {
      pushKP(['ctrl']);
      globalhelixState.typeSubscription(globalhelixState, 'w');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_x', () => {
      pushKP(['ctrl']);
      globalhelixState.typeSubscription(globalhelixState, 'x');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_y', () => {
      pushKP(['ctrl']);
      globalhelixState.typeSubscription(globalhelixState, 'y');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_z', () => {
      pushKP(['ctrl']);
      globalhelixState.typeSubscription(globalhelixState, 'z');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_pageup', () => {
      pushKP(['ctrl']);
      globalhelixState.typeSubscription(globalhelixState, 'pageup');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_pagedown', () => {
      pushKP(['ctrl']);
      globalhelixState.typeSubscription(globalhelixState, 'pagedown');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_home', () => {
      pushKP(['ctrl']);
      globalhelixState.typeSubscription(globalhelixState, 'home');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_end', () => {
      pushKP(['ctrl']);
      globalhelixState.typeSubscription(globalhelixState, 'end');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_escape', () => {
      pushKP(['ctrl']);
      globalhelixState.typeSubscription(globalhelixState, 'escape');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_backspace', () => {
      pushKP(['ctrl']);
      globalhelixState.typeSubscription(globalhelixState, 'backspace');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_left', () => {
      pushKP(['ctrl']);
      globalhelixState.typeSubscription(globalhelixState, 'left');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_right', () => {
      pushKP(['ctrl']);
      globalhelixState.typeSubscription(globalhelixState, 'right');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_up', () => {
      pushKP(['ctrl']);
      globalhelixState.typeSubscription(globalhelixState, 'up');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_down', () => {
      pushKP(['ctrl']);
      globalhelixState.typeSubscription(globalhelixState, 'down');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_[', () => {
      pushKP(['ctrl']);
      globalhelixState.typeSubscription(globalhelixState, '[');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_]', () => {
      pushKP(['ctrl']);
      globalhelixState.typeSubscription(globalhelixState, ']');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_backtick', () => {
      pushKP(['ctrl']);
      globalhelixState.typeSubscription(globalhelixState, '`');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_;', () => {
      pushKP(['ctrl']);
      globalhelixState.typeSubscription(globalhelixState, ';');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_squote', () => {
      pushKP(['ctrl']);
      globalhelixState.typeSubscription(globalhelixState, "'");
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_,', () => {
      pushKP(['ctrl']);
      globalhelixState.typeSubscription(globalhelixState, ',');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_.', () => {
      pushKP(['ctrl']);
      globalhelixState.typeSubscription(globalhelixState, '.');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_/', () => {
      pushKP(['ctrl']);
      globalhelixState.typeSubscription(globalhelixState, '/');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_bslash', () => {
      pushKP(['ctrl']);
      globalhelixState.typeSubscription(globalhelixState, '\\');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_eq', () => {
      pushKP(['ctrl']);
      globalhelixState.typeSubscription(globalhelixState, '=');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_-', () => {
      pushKP(['ctrl']);
      globalhelixState.typeSubscription(globalhelixState, '-');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_1', () => {
      pushKP(['ctrl']);
      globalhelixState.typeSubscription(globalhelixState, '1');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_2', () => {
      pushKP(['ctrl']);
      globalhelixState.typeSubscription(globalhelixState, '2');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_3', () => {
      pushKP(['ctrl']);
      globalhelixState.typeSubscription(globalhelixState, '3');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_4', () => {
      pushKP(['ctrl']);
      globalhelixState.typeSubscription(globalhelixState, '4');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_5', () => {
      pushKP(['ctrl']);
      globalhelixState.typeSubscription(globalhelixState, '5');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_6', () => {
      pushKP(['ctrl']);
      globalhelixState.typeSubscription(globalhelixState, '6');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_7', () => {
      pushKP(['ctrl']);
      globalhelixState.typeSubscription(globalhelixState, '7');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_8', () => {
      pushKP(['ctrl']);
      globalhelixState.typeSubscription(globalhelixState, '8');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_9', () => {
      pushKP(['ctrl']);
      globalhelixState.typeSubscription(globalhelixState, '9');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_0', () => {
      pushKP(['ctrl']);
      globalhelixState.typeSubscription(globalhelixState, '0');
    }),
    commands.registerCommand('extension.helixKeymap.alt_a', () => {
      pushKP(['alt']);
      globalhelixState.typeSubscription(globalhelixState, 'a');
    }),
    commands.registerCommand('extension.helixKeymap.alt_b', () => {
      pushKP(['alt']);
      globalhelixState.typeSubscription(globalhelixState, 'b');
    }),
    commands.registerCommand('extension.helixKeymap.alt_c', () => {
      pushKP(['alt']);
      globalhelixState.typeSubscription(globalhelixState, 'c');
    }),
    commands.registerCommand('extension.helixKeymap.alt_d', () => {
      pushKP(['alt']);
      globalhelixState.typeSubscription(globalhelixState, 'd');
    }),
    commands.registerCommand('extension.helixKeymap.alt_e', () => {
      pushKP(['alt']);
      globalhelixState.typeSubscription(globalhelixState, 'e');
    }),
    commands.registerCommand('extension.helixKeymap.alt_f', () => {
      pushKP(['alt']);
      globalhelixState.typeSubscription(globalhelixState, 'f');
    }),
    commands.registerCommand('extension.helixKeymap.alt_g', () => {
      pushKP(['alt']);
      globalhelixState.typeSubscription(globalhelixState, 'g');
    }),
    commands.registerCommand('extension.helixKeymap.alt_h', () => {
      pushKP(['alt']);
      globalhelixState.typeSubscription(globalhelixState, 'h');
    }),
    commands.registerCommand('extension.helixKeymap.alt_i', () => {
      pushKP(['alt']);
      globalhelixState.typeSubscription(globalhelixState, 'i');
    }),
    commands.registerCommand('extension.helixKeymap.alt_j', () => {
      pushKP(['alt']);
      globalhelixState.typeSubscription(globalhelixState, 'j');
    }),
    commands.registerCommand('extension.helixKeymap.alt_k', () => {
      pushKP(['alt']);
      globalhelixState.typeSubscription(globalhelixState, 'k');
    }),
    commands.registerCommand('extension.helixKeymap.alt_l', () => {
      pushKP(['alt']);
      globalhelixState.typeSubscription(globalhelixState, 'l');
    }),
    commands.registerCommand('extension.helixKeymap.alt_m', () => {
      pushKP(['alt']);
      globalhelixState.typeSubscription(globalhelixState, 'm');
    }),
    commands.registerCommand('extension.helixKeymap.alt_n', () => {
      pushKP(['alt']);
      globalhelixState.typeSubscription(globalhelixState, 'n');
    }),
    commands.registerCommand('extension.helixKeymap.alt_o', () => {
      pushKP(['alt']);
      globalhelixState.typeSubscription(globalhelixState, 'o');
    }),
    commands.registerCommand('extension.helixKeymap.alt_p', () => {
      pushKP(['alt']);
      globalhelixState.typeSubscription(globalhelixState, 'p');
    }),
    commands.registerCommand('extension.helixKeymap.alt_q', () => {
      pushKP(['alt']);
      globalhelixState.typeSubscription(globalhelixState, 'q');
    }),
    commands.registerCommand('extension.helixKeymap.alt_r', () => {
      pushKP(['alt']);
      globalhelixState.typeSubscription(globalhelixState, 'r');
    }),
    commands.registerCommand('extension.helixKeymap.alt_s', () => {
      pushKP(['alt']);
      globalhelixState.typeSubscription(globalhelixState, 's');
    }),
    commands.registerCommand('extension.helixKeymap.alt_t', () => {
      pushKP(['alt']);
      globalhelixState.typeSubscription(globalhelixState, 't');
    }),
    commands.registerCommand('extension.helixKeymap.alt_u', () => {
      pushKP(['alt']);
      globalhelixState.typeSubscription(globalhelixState, 'u');
    }),
    commands.registerCommand('extension.helixKeymap.alt_v', () => {
      pushKP(['alt']);
      globalhelixState.typeSubscription(globalhelixState, 'v');
    }),
    commands.registerCommand('extension.helixKeymap.alt_w', () => {
      pushKP(['alt']);
      globalhelixState.typeSubscription(globalhelixState, 'w');
    }),
    commands.registerCommand('extension.helixKeymap.alt_x', () => {
      pushKP(['alt']);
      globalhelixState.typeSubscription(globalhelixState, 'x');
    }),
    commands.registerCommand('extension.helixKeymap.alt_y', () => {
      pushKP(['alt']);
      globalhelixState.typeSubscription(globalhelixState, 'y');
    }),
    commands.registerCommand('extension.helixKeymap.alt_z', () => {
      pushKP(['alt']);
      globalhelixState.typeSubscription(globalhelixState, 'z');
    }),
    commands.registerCommand('extension.helixKeymap.alt_pageup', () => {
      pushKP(['alt']);
      globalhelixState.typeSubscription(globalhelixState, 'pageup');
    }),
    commands.registerCommand('extension.helixKeymap.alt_pagedown', () => {
      pushKP(['alt']);
      globalhelixState.typeSubscription(globalhelixState, 'pagedown');
    }),
    commands.registerCommand('extension.helixKeymap.alt_home', () => {
      pushKP(['alt']);
      globalhelixState.typeSubscription(globalhelixState, 'home');
    }),
    commands.registerCommand('extension.helixKeymap.alt_end', () => {
      pushKP(['alt']);
      globalhelixState.typeSubscription(globalhelixState, 'end');
    }),
    commands.registerCommand('extension.helixKeymap.alt_escape', () => {
      pushKP(['alt']);
      globalhelixState.typeSubscription(globalhelixState, 'escape');
    }),
    commands.registerCommand('extension.helixKeymap.alt_backspace', () => {
      pushKP(['alt']);
      globalhelixState.typeSubscription(globalhelixState, 'backspace');
    }),
    commands.registerCommand('extension.helixKeymap.alt_left', () => {
      pushKP(['alt']);
      globalhelixState.typeSubscription(globalhelixState, 'left');
    }),
    commands.registerCommand('extension.helixKeymap.alt_right', () => {
      pushKP(['alt']);
      globalhelixState.typeSubscription(globalhelixState, 'right');
    }),
    commands.registerCommand('extension.helixKeymap.alt_up', () => {
      pushKP(['alt']);
      globalhelixState.typeSubscription(globalhelixState, 'up');
    }),
    commands.registerCommand('extension.helixKeymap.alt_down', () => {
      pushKP(['alt']);
      globalhelixState.typeSubscription(globalhelixState, 'down');
    }),
    commands.registerCommand('extension.helixKeymap.alt_[', () => {
      pushKP(['alt']);
      globalhelixState.typeSubscription(globalhelixState, '[');
    }),
    commands.registerCommand('extension.helixKeymap.alt_]', () => {
      pushKP(['alt']);
      globalhelixState.typeSubscription(globalhelixState, ']');
    }),
    commands.registerCommand('extension.helixKeymap.alt_backtick', () => {
      pushKP(['alt']);
      globalhelixState.typeSubscription(globalhelixState, '`');
    }),
    commands.registerCommand('extension.helixKeymap.alt_;', () => {
      pushKP(['alt']);
      globalhelixState.typeSubscription(globalhelixState, ';');
    }),
    commands.registerCommand('extension.helixKeymap.alt_squote', () => {
      pushKP(['alt']);
      globalhelixState.typeSubscription(globalhelixState, "'");
    }),
    commands.registerCommand('extension.helixKeymap.alt_,', () => {
      pushKP(['alt']);
      globalhelixState.typeSubscription(globalhelixState, ',');
    }),
    commands.registerCommand('extension.helixKeymap.alt_.', () => {
      pushKP(['alt']);
      globalhelixState.typeSubscription(globalhelixState, '.');
    }),
    commands.registerCommand('extension.helixKeymap.alt_/', () => {
      pushKP(['alt']);
      globalhelixState.typeSubscription(globalhelixState, '/');
    }),
    commands.registerCommand('extension.helixKeymap.alt_bslash', () => {
      pushKP(['alt']);
      globalhelixState.typeSubscription(globalhelixState, '\\');
    }),
    commands.registerCommand('extension.helixKeymap.alt_eq', () => {
      pushKP(['alt']);
      globalhelixState.typeSubscription(globalhelixState, '=');
    }),
    commands.registerCommand('extension.helixKeymap.alt_-', () => {
      pushKP(['alt']);
      globalhelixState.typeSubscription(globalhelixState, '-');
    }),
    commands.registerCommand('extension.helixKeymap.alt_1', () => {
      pushKP(['alt']);
      globalhelixState.typeSubscription(globalhelixState, '1');
    }),
    commands.registerCommand('extension.helixKeymap.alt_2', () => {
      pushKP(['alt']);
      globalhelixState.typeSubscription(globalhelixState, '2');
    }),
    commands.registerCommand('extension.helixKeymap.alt_3', () => {
      pushKP(['alt']);
      globalhelixState.typeSubscription(globalhelixState, '3');
    }),
    commands.registerCommand('extension.helixKeymap.alt_4', () => {
      pushKP(['alt']);
      globalhelixState.typeSubscription(globalhelixState, '4');
    }),
    commands.registerCommand('extension.helixKeymap.alt_5', () => {
      pushKP(['alt']);
      globalhelixState.typeSubscription(globalhelixState, '5');
    }),
    commands.registerCommand('extension.helixKeymap.alt_6', () => {
      pushKP(['alt']);
      globalhelixState.typeSubscription(globalhelixState, '6');
    }),
    commands.registerCommand('extension.helixKeymap.alt_7', () => {
      pushKP(['alt']);
      globalhelixState.typeSubscription(globalhelixState, '7');
    }),
    commands.registerCommand('extension.helixKeymap.alt_8', () => {
      pushKP(['alt']);
      globalhelixState.typeSubscription(globalhelixState, '8');
    }),
    commands.registerCommand('extension.helixKeymap.alt_9', () => {
      pushKP(['alt']);
      globalhelixState.typeSubscription(globalhelixState, '9');
    }),
    commands.registerCommand('extension.helixKeymap.alt_0', () => {
      pushKP(['alt']);
      globalhelixState.typeSubscription(globalhelixState, '0');
    }),
    commands.registerCommand('extension.helixKeymap.shift_a', () => {
      pushKP(['shift']);
      globalhelixState.typeSubscription(globalhelixState, 'a');
    }),
    commands.registerCommand('extension.helixKeymap.shift_b', () => {
      pushKP(['shift']);
      globalhelixState.typeSubscription(globalhelixState, 'b');
    }),
    commands.registerCommand('extension.helixKeymap.shift_c', () => {
      pushKP(['shift']);
      globalhelixState.typeSubscription(globalhelixState, 'c');
    }),
    commands.registerCommand('extension.helixKeymap.shift_d', () => {
      pushKP(['shift']);
      globalhelixState.typeSubscription(globalhelixState, 'd');
    }),
    commands.registerCommand('extension.helixKeymap.shift_e', () => {
      pushKP(['shift']);
      globalhelixState.typeSubscription(globalhelixState, 'e');
    }),
    commands.registerCommand('extension.helixKeymap.shift_f', () => {
      pushKP(['shift']);
      globalhelixState.typeSubscription(globalhelixState, 'f');
    }),
    commands.registerCommand('extension.helixKeymap.shift_g', () => {
      pushKP(['shift']);
      globalhelixState.typeSubscription(globalhelixState, 'g');
    }),
    commands.registerCommand('extension.helixKeymap.shift_h', () => {
      pushKP(['shift']);
      globalhelixState.typeSubscription(globalhelixState, 'h');
    }),
    commands.registerCommand('extension.helixKeymap.shift_i', () => {
      pushKP(['shift']);
      globalhelixState.typeSubscription(globalhelixState, 'i');
    }),
    commands.registerCommand('extension.helixKeymap.shift_j', () => {
      pushKP(['shift']);
      globalhelixState.typeSubscription(globalhelixState, 'j');
    }),
    commands.registerCommand('extension.helixKeymap.shift_k', () => {
      pushKP(['shift']);
      globalhelixState.typeSubscription(globalhelixState, 'k');
    }),
    commands.registerCommand('extension.helixKeymap.shift_l', () => {
      pushKP(['shift']);
      globalhelixState.typeSubscription(globalhelixState, 'l');
    }),
    commands.registerCommand('extension.helixKeymap.shift_m', () => {
      pushKP(['shift']);
      globalhelixState.typeSubscription(globalhelixState, 'm');
    }),
    commands.registerCommand('extension.helixKeymap.shift_n', () => {
      pushKP(['shift']);
      globalhelixState.typeSubscription(globalhelixState, 'n');
    }),
    commands.registerCommand('extension.helixKeymap.shift_o', () => {
      pushKP(['shift']);
      globalhelixState.typeSubscription(globalhelixState, 'o');
    }),
    commands.registerCommand('extension.helixKeymap.shift_p', () => {
      pushKP(['shift']);
      globalhelixState.typeSubscription(globalhelixState, 'p');
    }),
    commands.registerCommand('extension.helixKeymap.shift_q', () => {
      pushKP(['shift']);
      globalhelixState.typeSubscription(globalhelixState, 'q');
    }),
    commands.registerCommand('extension.helixKeymap.shift_r', () => {
      pushKP(['shift']);
      globalhelixState.typeSubscription(globalhelixState, 'r');
    }),
    commands.registerCommand('extension.helixKeymap.shift_s', () => {
      pushKP(['shift']);
      globalhelixState.typeSubscription(globalhelixState, 's');
    }),
    commands.registerCommand('extension.helixKeymap.shift_t', () => {
      pushKP(['shift']);
      globalhelixState.typeSubscription(globalhelixState, 't');
    }),
    commands.registerCommand('extension.helixKeymap.shift_u', () => {
      pushKP(['shift']);
      globalhelixState.typeSubscription(globalhelixState, 'u');
    }),
    commands.registerCommand('extension.helixKeymap.shift_v', () => {
      pushKP(['shift']);
      globalhelixState.typeSubscription(globalhelixState, 'v');
    }),
    commands.registerCommand('extension.helixKeymap.shift_w', () => {
      pushKP(['shift']);
      globalhelixState.typeSubscription(globalhelixState, 'w');
    }),
    commands.registerCommand('extension.helixKeymap.shift_x', () => {
      pushKP(['shift']);
      globalhelixState.typeSubscription(globalhelixState, 'x');
    }),
    commands.registerCommand('extension.helixKeymap.shift_y', () => {
      pushKP(['shift']);
      globalhelixState.typeSubscription(globalhelixState, 'y');
    }),
    commands.registerCommand('extension.helixKeymap.shift_z', () => {
      pushKP(['shift']);
      globalhelixState.typeSubscription(globalhelixState, 'z');
    }),
    commands.registerCommand('extension.helixKeymap.shift_pageup', () => {
      pushKP(['shift']);
      globalhelixState.typeSubscription(globalhelixState, 'pageup');
    }),
    commands.registerCommand('extension.helixKeymap.shift_pagedown', () => {
      pushKP(['shift']);
      globalhelixState.typeSubscription(globalhelixState, 'pagedown');
    }),
    commands.registerCommand('extension.helixKeymap.shift_home', () => {
      pushKP(['shift']);
      globalhelixState.typeSubscription(globalhelixState, 'home');
    }),
    commands.registerCommand('extension.helixKeymap.shift_end', () => {
      pushKP(['shift']);
      globalhelixState.typeSubscription(globalhelixState, 'end');
    }),
    commands.registerCommand('extension.helixKeymap.shift_escape', () => {
      pushKP(['shift']);
      globalhelixState.typeSubscription(globalhelixState, 'escape');
    }),
    commands.registerCommand('extension.helixKeymap.shift_backspace', () => {
      pushKP(['shift']);
      globalhelixState.typeSubscription(globalhelixState, 'backspace');
    }),
    commands.registerCommand('extension.helixKeymap.shift_left', () => {
      pushKP(['shift']);
      globalhelixState.typeSubscription(globalhelixState, 'left');
    }),
    commands.registerCommand('extension.helixKeymap.shift_right', () => {
      pushKP(['shift']);
      globalhelixState.typeSubscription(globalhelixState, 'right');
    }),
    commands.registerCommand('extension.helixKeymap.shift_up', () => {
      pushKP(['shift']);
      globalhelixState.typeSubscription(globalhelixState, 'up');
    }),
    commands.registerCommand('extension.helixKeymap.shift_down', () => {
      pushKP(['shift']);
      globalhelixState.typeSubscription(globalhelixState, 'down');
    }),
    commands.registerCommand('extension.helixKeymap.shift_[', () => {
      pushKP(['shift']);
      globalhelixState.typeSubscription(globalhelixState, '[');
    }),
    commands.registerCommand('extension.helixKeymap.shift_]', () => {
      pushKP(['shift']);
      globalhelixState.typeSubscription(globalhelixState, ']');
    }),
    commands.registerCommand('extension.helixKeymap.shift_backtick', () => {
      pushKP(['shift']);
      globalhelixState.typeSubscription(globalhelixState, '`');
    }),
    commands.registerCommand('extension.helixKeymap.shift_;', () => {
      pushKP(['shift']);
      globalhelixState.typeSubscription(globalhelixState, ';');
    }),
    commands.registerCommand('extension.helixKeymap.shift_squote', () => {
      pushKP(['shift']);
      globalhelixState.typeSubscription(globalhelixState, "'");
    }),
    commands.registerCommand('extension.helixKeymap.shift_,', () => {
      pushKP(['shift']);
      globalhelixState.typeSubscription(globalhelixState, ',');
    }),
    commands.registerCommand('extension.helixKeymap.shift_.', () => {
      pushKP(['shift']);
      globalhelixState.typeSubscription(globalhelixState, '.');
    }),
    commands.registerCommand('extension.helixKeymap.shift_/', () => {
      pushKP(['shift']);
      globalhelixState.typeSubscription(globalhelixState, '/');
    }),
    commands.registerCommand('extension.helixKeymap.shift_bslash', () => {
      pushKP(['shift']);
      globalhelixState.typeSubscription(globalhelixState, '\\');
    }),
    commands.registerCommand('extension.helixKeymap.shift_eq', () => {
      pushKP(['shift']);
      globalhelixState.typeSubscription(globalhelixState, '=');
    }),
    commands.registerCommand('extension.helixKeymap.shift_-', () => {
      pushKP(['shift']);
      globalhelixState.typeSubscription(globalhelixState, '-');
    }),
    commands.registerCommand('extension.helixKeymap.shift_1', () => {
      pushKP(['shift']);
      globalhelixState.typeSubscription(globalhelixState, '1');
    }),
    commands.registerCommand('extension.helixKeymap.shift_2', () => {
      pushKP(['shift']);
      globalhelixState.typeSubscription(globalhelixState, '2');
    }),
    commands.registerCommand('extension.helixKeymap.shift_3', () => {
      pushKP(['shift']);
      globalhelixState.typeSubscription(globalhelixState, '3');
    }),
    commands.registerCommand('extension.helixKeymap.shift_4', () => {
      pushKP(['shift']);
      globalhelixState.typeSubscription(globalhelixState, '4');
    }),
    commands.registerCommand('extension.helixKeymap.shift_5', () => {
      pushKP(['shift']);
      globalhelixState.typeSubscription(globalhelixState, '5');
    }),
    commands.registerCommand('extension.helixKeymap.shift_6', () => {
      pushKP(['shift']);
      globalhelixState.typeSubscription(globalhelixState, '6');
    }),
    commands.registerCommand('extension.helixKeymap.shift_7', () => {
      pushKP(['shift']);
      globalhelixState.typeSubscription(globalhelixState, '7');
    }),
    commands.registerCommand('extension.helixKeymap.shift_8', () => {
      pushKP(['shift']);
      globalhelixState.typeSubscription(globalhelixState, '8');
    }),
    commands.registerCommand('extension.helixKeymap.shift_9', () => {
      pushKP(['shift']);
      globalhelixState.typeSubscription(globalhelixState, '9');
    }),
    commands.registerCommand('extension.helixKeymap.shift_0', () => {
      pushKP(['shift']);
      globalhelixState.typeSubscription(globalhelixState, '0');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_alt_a', () => {
      pushKP(['ctrl', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, 'a');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_alt_b', () => {
      pushKP(['ctrl', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, 'b');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_alt_c', () => {
      pushKP(['ctrl', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, 'c');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_alt_d', () => {
      pushKP(['ctrl', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, 'd');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_alt_e', () => {
      pushKP(['ctrl', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, 'e');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_alt_f', () => {
      pushKP(['ctrl', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, 'f');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_alt_g', () => {
      pushKP(['ctrl', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, 'g');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_alt_h', () => {
      pushKP(['ctrl', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, 'h');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_alt_i', () => {
      pushKP(['ctrl', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, 'i');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_alt_j', () => {
      pushKP(['ctrl', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, 'j');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_alt_k', () => {
      pushKP(['ctrl', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, 'k');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_alt_l', () => {
      pushKP(['ctrl', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, 'l');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_alt_m', () => {
      pushKP(['ctrl', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, 'm');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_alt_n', () => {
      pushKP(['ctrl', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, 'n');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_alt_o', () => {
      pushKP(['ctrl', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, 'o');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_alt_p', () => {
      pushKP(['ctrl', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, 'p');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_alt_q', () => {
      pushKP(['ctrl', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, 'q');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_alt_r', () => {
      pushKP(['ctrl', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, 'r');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_alt_s', () => {
      pushKP(['ctrl', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, 's');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_alt_t', () => {
      pushKP(['ctrl', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, 't');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_alt_u', () => {
      pushKP(['ctrl', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, 'u');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_alt_v', () => {
      pushKP(['ctrl', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, 'v');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_alt_w', () => {
      pushKP(['ctrl', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, 'w');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_alt_x', () => {
      pushKP(['ctrl', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, 'x');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_alt_y', () => {
      pushKP(['ctrl', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, 'y');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_alt_z', () => {
      pushKP(['ctrl', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, 'z');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_alt_pageup', () => {
      pushKP(['ctrl', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, 'pageup');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_alt_pagedown', () => {
      pushKP(['ctrl', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, 'pagedown');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_alt_home', () => {
      pushKP(['ctrl', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, 'home');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_alt_end', () => {
      pushKP(['ctrl', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, 'end');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_alt_escape', () => {
      pushKP(['ctrl', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, 'escape');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_alt_backspace', () => {
      pushKP(['ctrl', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, 'backspace');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_alt_left', () => {
      pushKP(['ctrl', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, 'left');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_alt_right', () => {
      pushKP(['ctrl', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, 'right');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_alt_up', () => {
      pushKP(['ctrl', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, 'up');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_alt_down', () => {
      pushKP(['ctrl', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, 'down');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_alt_[', () => {
      pushKP(['ctrl', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, '[');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_alt_]', () => {
      pushKP(['ctrl', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, ']');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_alt_backtick', () => {
      pushKP(['ctrl', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, '`');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_alt_;', () => {
      pushKP(['ctrl', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, ';');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_alt_squote', () => {
      pushKP(['ctrl', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, "'");
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_alt_,', () => {
      pushKP(['ctrl', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, ',');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_alt_.', () => {
      pushKP(['ctrl', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, '.');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_alt_/', () => {
      pushKP(['ctrl', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, '/');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_alt_bslash', () => {
      pushKP(['ctrl', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, '\\');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_alt_eq', () => {
      pushKP(['ctrl', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, '=');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_alt_-', () => {
      pushKP(['ctrl', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, '-');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_alt_1', () => {
      pushKP(['ctrl', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, '1');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_alt_2', () => {
      pushKP(['ctrl', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, '2');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_alt_3', () => {
      pushKP(['ctrl', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, '3');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_alt_4', () => {
      pushKP(['ctrl', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, '4');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_alt_5', () => {
      pushKP(['ctrl', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, '5');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_alt_6', () => {
      pushKP(['ctrl', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, '6');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_alt_7', () => {
      pushKP(['ctrl', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, '7');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_alt_8', () => {
      pushKP(['ctrl', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, '8');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_alt_9', () => {
      pushKP(['ctrl', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, '9');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_alt_0', () => {
      pushKP(['ctrl', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, '0');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_shift_a', () => {
      pushKP(['ctrl', 'shift']);
      globalhelixState.typeSubscription(globalhelixState, 'a');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_shift_b', () => {
      pushKP(['ctrl', 'shift']);
      globalhelixState.typeSubscription(globalhelixState, 'b');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_shift_c', () => {
      pushKP(['ctrl', 'shift']);
      globalhelixState.typeSubscription(globalhelixState, 'c');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_shift_d', () => {
      pushKP(['ctrl', 'shift']);
      globalhelixState.typeSubscription(globalhelixState, 'd');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_shift_e', () => {
      pushKP(['ctrl', 'shift']);
      globalhelixState.typeSubscription(globalhelixState, 'e');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_shift_f', () => {
      pushKP(['ctrl', 'shift']);
      globalhelixState.typeSubscription(globalhelixState, 'f');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_shift_g', () => {
      pushKP(['ctrl', 'shift']);
      globalhelixState.typeSubscription(globalhelixState, 'g');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_shift_h', () => {
      pushKP(['ctrl', 'shift']);
      globalhelixState.typeSubscription(globalhelixState, 'h');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_shift_i', () => {
      pushKP(['ctrl', 'shift']);
      globalhelixState.typeSubscription(globalhelixState, 'i');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_shift_j', () => {
      pushKP(['ctrl', 'shift']);
      globalhelixState.typeSubscription(globalhelixState, 'j');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_shift_k', () => {
      pushKP(['ctrl', 'shift']);
      globalhelixState.typeSubscription(globalhelixState, 'k');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_shift_l', () => {
      pushKP(['ctrl', 'shift']);
      globalhelixState.typeSubscription(globalhelixState, 'l');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_shift_m', () => {
      pushKP(['ctrl', 'shift']);
      globalhelixState.typeSubscription(globalhelixState, 'm');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_shift_n', () => {
      pushKP(['ctrl', 'shift']);
      globalhelixState.typeSubscription(globalhelixState, 'n');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_shift_o', () => {
      pushKP(['ctrl', 'shift']);
      globalhelixState.typeSubscription(globalhelixState, 'o');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_shift_p', () => {
      pushKP(['ctrl', 'shift']);
      globalhelixState.typeSubscription(globalhelixState, 'p');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_shift_q', () => {
      pushKP(['ctrl', 'shift']);
      globalhelixState.typeSubscription(globalhelixState, 'q');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_shift_r', () => {
      pushKP(['ctrl', 'shift']);
      globalhelixState.typeSubscription(globalhelixState, 'r');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_shift_s', () => {
      pushKP(['ctrl', 'shift']);
      globalhelixState.typeSubscription(globalhelixState, 's');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_shift_t', () => {
      pushKP(['ctrl', 'shift']);
      globalhelixState.typeSubscription(globalhelixState, 't');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_shift_u', () => {
      pushKP(['ctrl', 'shift']);
      globalhelixState.typeSubscription(globalhelixState, 'u');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_shift_v', () => {
      pushKP(['ctrl', 'shift']);
      globalhelixState.typeSubscription(globalhelixState, 'v');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_shift_w', () => {
      pushKP(['ctrl', 'shift']);
      globalhelixState.typeSubscription(globalhelixState, 'w');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_shift_x', () => {
      pushKP(['ctrl', 'shift']);
      globalhelixState.typeSubscription(globalhelixState, 'x');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_shift_y', () => {
      pushKP(['ctrl', 'shift']);
      globalhelixState.typeSubscription(globalhelixState, 'y');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_shift_z', () => {
      pushKP(['ctrl', 'shift']);
      globalhelixState.typeSubscription(globalhelixState, 'z');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_shift_pageup', () => {
      pushKP(['ctrl', 'shift']);
      globalhelixState.typeSubscription(globalhelixState, 'pageup');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_shift_pagedown', () => {
      pushKP(['ctrl', 'shift']);
      globalhelixState.typeSubscription(globalhelixState, 'pagedown');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_shift_home', () => {
      pushKP(['ctrl', 'shift']);
      globalhelixState.typeSubscription(globalhelixState, 'home');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_shift_end', () => {
      pushKP(['ctrl', 'shift']);
      globalhelixState.typeSubscription(globalhelixState, 'end');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_shift_escape', () => {
      pushKP(['ctrl', 'shift']);
      globalhelixState.typeSubscription(globalhelixState, 'escape');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_shift_backspace', () => {
      pushKP(['ctrl', 'shift']);
      globalhelixState.typeSubscription(globalhelixState, 'backspace');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_shift_left', () => {
      pushKP(['ctrl', 'shift']);
      globalhelixState.typeSubscription(globalhelixState, 'left');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_shift_right', () => {
      pushKP(['ctrl', 'shift']);
      globalhelixState.typeSubscription(globalhelixState, 'right');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_shift_up', () => {
      pushKP(['ctrl', 'shift']);
      globalhelixState.typeSubscription(globalhelixState, 'up');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_shift_down', () => {
      pushKP(['ctrl', 'shift']);
      globalhelixState.typeSubscription(globalhelixState, 'down');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_shift_[', () => {
      pushKP(['ctrl', 'shift']);
      globalhelixState.typeSubscription(globalhelixState, '[');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_shift_]', () => {
      pushKP(['ctrl', 'shift']);
      globalhelixState.typeSubscription(globalhelixState, ']');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_shift_backtick', () => {
      pushKP(['ctrl', 'shift']);
      globalhelixState.typeSubscription(globalhelixState, '`');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_shift_;', () => {
      pushKP(['ctrl', 'shift']);
      globalhelixState.typeSubscription(globalhelixState, ';');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_shift_squote', () => {
      pushKP(['ctrl', 'shift']);
      globalhelixState.typeSubscription(globalhelixState, "'");
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_shift_,', () => {
      pushKP(['ctrl', 'shift']);
      globalhelixState.typeSubscription(globalhelixState, ',');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_shift_.', () => {
      pushKP(['ctrl', 'shift']);
      globalhelixState.typeSubscription(globalhelixState, '.');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_shift_/', () => {
      pushKP(['ctrl', 'shift']);
      globalhelixState.typeSubscription(globalhelixState, '/');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_shift_bslash', () => {
      pushKP(['ctrl', 'shift']);
      globalhelixState.typeSubscription(globalhelixState, '\\');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_shift_eq', () => {
      pushKP(['ctrl', 'shift']);
      globalhelixState.typeSubscription(globalhelixState, '=');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_shift_-', () => {
      pushKP(['ctrl', 'shift']);
      globalhelixState.typeSubscription(globalhelixState, '-');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_shift_1', () => {
      pushKP(['ctrl', 'shift']);
      globalhelixState.typeSubscription(globalhelixState, '1');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_shift_2', () => {
      pushKP(['ctrl', 'shift']);
      globalhelixState.typeSubscription(globalhelixState, '2');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_shift_3', () => {
      pushKP(['ctrl', 'shift']);
      globalhelixState.typeSubscription(globalhelixState, '3');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_shift_4', () => {
      pushKP(['ctrl', 'shift']);
      globalhelixState.typeSubscription(globalhelixState, '4');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_shift_5', () => {
      pushKP(['ctrl', 'shift']);
      globalhelixState.typeSubscription(globalhelixState, '5');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_shift_6', () => {
      pushKP(['ctrl', 'shift']);
      globalhelixState.typeSubscription(globalhelixState, '6');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_shift_7', () => {
      pushKP(['ctrl', 'shift']);
      globalhelixState.typeSubscription(globalhelixState, '7');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_shift_8', () => {
      pushKP(['ctrl', 'shift']);
      globalhelixState.typeSubscription(globalhelixState, '8');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_shift_9', () => {
      pushKP(['ctrl', 'shift']);
      globalhelixState.typeSubscription(globalhelixState, '9');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_shift_0', () => {
      pushKP(['ctrl', 'shift']);
      globalhelixState.typeSubscription(globalhelixState, '0');
    }),
    commands.registerCommand('extension.helixKeymap.shift_alt_a', () => {
      pushKP(['shift', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, 'a');
    }),
    commands.registerCommand('extension.helixKeymap.shift_alt_b', () => {
      pushKP(['shift', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, 'b');
    }),
    commands.registerCommand('extension.helixKeymap.shift_alt_c', () => {
      pushKP(['shift', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, 'c');
    }),
    commands.registerCommand('extension.helixKeymap.shift_alt_d', () => {
      pushKP(['shift', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, 'd');
    }),
    commands.registerCommand('extension.helixKeymap.shift_alt_e', () => {
      pushKP(['shift', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, 'e');
    }),
    commands.registerCommand('extension.helixKeymap.shift_alt_f', () => {
      pushKP(['shift', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, 'f');
    }),
    commands.registerCommand('extension.helixKeymap.shift_alt_g', () => {
      pushKP(['shift', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, 'g');
    }),
    commands.registerCommand('extension.helixKeymap.shift_alt_h', () => {
      pushKP(['shift', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, 'h');
    }),
    commands.registerCommand('extension.helixKeymap.shift_alt_i', () => {
      pushKP(['shift', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, 'i');
    }),
    commands.registerCommand('extension.helixKeymap.shift_alt_j', () => {
      pushKP(['shift', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, 'j');
    }),
    commands.registerCommand('extension.helixKeymap.shift_alt_k', () => {
      pushKP(['shift', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, 'k');
    }),
    commands.registerCommand('extension.helixKeymap.shift_alt_l', () => {
      pushKP(['shift', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, 'l');
    }),
    commands.registerCommand('extension.helixKeymap.shift_alt_m', () => {
      pushKP(['shift', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, 'm');
    }),
    commands.registerCommand('extension.helixKeymap.shift_alt_n', () => {
      pushKP(['shift', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, 'n');
    }),
    commands.registerCommand('extension.helixKeymap.shift_alt_o', () => {
      pushKP(['shift', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, 'o');
    }),
    commands.registerCommand('extension.helixKeymap.shift_alt_p', () => {
      pushKP(['shift', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, 'p');
    }),
    commands.registerCommand('extension.helixKeymap.shift_alt_q', () => {
      pushKP(['shift', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, 'q');
    }),
    commands.registerCommand('extension.helixKeymap.shift_alt_r', () => {
      pushKP(['shift', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, 'r');
    }),
    commands.registerCommand('extension.helixKeymap.shift_alt_s', () => {
      pushKP(['shift', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, 's');
    }),
    commands.registerCommand('extension.helixKeymap.shift_alt_t', () => {
      pushKP(['shift', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, 't');
    }),
    commands.registerCommand('extension.helixKeymap.shift_alt_u', () => {
      pushKP(['shift', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, 'u');
    }),
    commands.registerCommand('extension.helixKeymap.shift_alt_v', () => {
      pushKP(['shift', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, 'v');
    }),
    commands.registerCommand('extension.helixKeymap.shift_alt_w', () => {
      pushKP(['shift', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, 'w');
    }),
    commands.registerCommand('extension.helixKeymap.shift_alt_x', () => {
      pushKP(['shift', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, 'x');
    }),
    commands.registerCommand('extension.helixKeymap.shift_alt_y', () => {
      pushKP(['shift', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, 'y');
    }),
    commands.registerCommand('extension.helixKeymap.shift_alt_z', () => {
      pushKP(['shift', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, 'z');
    }),
    commands.registerCommand('extension.helixKeymap.shift_alt_pageup', () => {
      pushKP(['shift', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, 'pageup');
    }),
    commands.registerCommand('extension.helixKeymap.shift_alt_pagedown', () => {
      pushKP(['shift', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, 'pagedown');
    }),
    commands.registerCommand('extension.helixKeymap.shift_alt_home', () => {
      pushKP(['shift', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, 'home');
    }),
    commands.registerCommand('extension.helixKeymap.shift_alt_end', () => {
      pushKP(['shift', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, 'end');
    }),
    commands.registerCommand('extension.helixKeymap.shift_alt_escape', () => {
      pushKP(['shift', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, 'escape');
    }),
    commands.registerCommand('extension.helixKeymap.shift_alt_backspace', () => {
      pushKP(['shift', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, 'backspace');
    }),
    commands.registerCommand('extension.helixKeymap.shift_alt_left', () => {
      pushKP(['shift', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, 'left');
    }),
    commands.registerCommand('extension.helixKeymap.shift_alt_right', () => {
      pushKP(['shift', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, 'right');
    }),
    commands.registerCommand('extension.helixKeymap.shift_alt_up', () => {
      pushKP(['shift', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, 'up');
    }),
    commands.registerCommand('extension.helixKeymap.shift_alt_down', () => {
      pushKP(['shift', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, 'down');
    }),
    commands.registerCommand('extension.helixKeymap.shift_alt_[', () => {
      pushKP(['shift', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, '[');
    }),
    commands.registerCommand('extension.helixKeymap.shift_alt_]', () => {
      pushKP(['shift', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, ']');
    }),
    commands.registerCommand('extension.helixKeymap.shift_alt_backtick', () => {
      pushKP(['shift', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, '`');
    }),
    commands.registerCommand('extension.helixKeymap.shift_alt_;', () => {
      pushKP(['shift', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, ';');
    }),
    commands.registerCommand('extension.helixKeymap.shift_alt_squote', () => {
      pushKP(['shift', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, "'");
    }),
    commands.registerCommand('extension.helixKeymap.shift_alt_,', () => {
      pushKP(['shift', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, ',');
    }),
    commands.registerCommand('extension.helixKeymap.shift_alt_.', () => {
      pushKP(['shift', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, '.');
    }),
    commands.registerCommand('extension.helixKeymap.shift_alt_/', () => {
      pushKP(['shift', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, '/');
    }),
    commands.registerCommand('extension.helixKeymap.shift_alt_bslash', () => {
      pushKP(['shift', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, '\\');
    }),
    commands.registerCommand('extension.helixKeymap.shift_alt_eq', () => {
      pushKP(['shift', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, '=');
    }),
    commands.registerCommand('extension.helixKeymap.shift_alt_-', () => {
      pushKP(['shift', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, '-');
    }),
    commands.registerCommand('extension.helixKeymap.shift_alt_1', () => {
      pushKP(['shift', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, '1');
    }),
    commands.registerCommand('extension.helixKeymap.shift_alt_2', () => {
      pushKP(['shift', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, '2');
    }),
    commands.registerCommand('extension.helixKeymap.shift_alt_3', () => {
      pushKP(['shift', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, '3');
    }),
    commands.registerCommand('extension.helixKeymap.shift_alt_4', () => {
      pushKP(['shift', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, '4');
    }),
    commands.registerCommand('extension.helixKeymap.shift_alt_5', () => {
      pushKP(['shift', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, '5');
    }),
    commands.registerCommand('extension.helixKeymap.shift_alt_6', () => {
      pushKP(['shift', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, '6');
    }),
    commands.registerCommand('extension.helixKeymap.shift_alt_7', () => {
      pushKP(['shift', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, '7');
    }),
    commands.registerCommand('extension.helixKeymap.shift_alt_8', () => {
      pushKP(['shift', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, '8');
    }),
    commands.registerCommand('extension.helixKeymap.shift_alt_9', () => {
      pushKP(['shift', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, '9');
    }),
    commands.registerCommand('extension.helixKeymap.shift_alt_0', () => {
      pushKP(['shift', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, '0');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_shift_alt_a', () => {
      pushKP(['ctrl', 'shift', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, 'a');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_shift_alt_b', () => {
      pushKP(['ctrl', 'shift', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, 'b');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_shift_alt_c', () => {
      pushKP(['ctrl', 'shift', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, 'c');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_shift_alt_d', () => {
      pushKP(['ctrl', 'shift', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, 'd');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_shift_alt_e', () => {
      pushKP(['ctrl', 'shift', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, 'e');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_shift_alt_f', () => {
      pushKP(['ctrl', 'shift', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, 'f');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_shift_alt_g', () => {
      pushKP(['ctrl', 'shift', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, 'g');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_shift_alt_h', () => {
      pushKP(['ctrl', 'shift', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, 'h');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_shift_alt_i', () => {
      pushKP(['ctrl', 'shift', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, 'i');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_shift_alt_j', () => {
      pushKP(['ctrl', 'shift', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, 'j');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_shift_alt_k', () => {
      pushKP(['ctrl', 'shift', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, 'k');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_shift_alt_l', () => {
      pushKP(['ctrl', 'shift', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, 'l');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_shift_alt_m', () => {
      pushKP(['ctrl', 'shift', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, 'm');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_shift_alt_n', () => {
      pushKP(['ctrl', 'shift', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, 'n');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_shift_alt_o', () => {
      pushKP(['ctrl', 'shift', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, 'o');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_shift_alt_p', () => {
      pushKP(['ctrl', 'shift', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, 'p');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_shift_alt_q', () => {
      pushKP(['ctrl', 'shift', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, 'q');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_shift_alt_r', () => {
      pushKP(['ctrl', 'shift', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, 'r');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_shift_alt_s', () => {
      pushKP(['ctrl', 'shift', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, 's');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_shift_alt_t', () => {
      pushKP(['ctrl', 'shift', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, 't');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_shift_alt_u', () => {
      pushKP(['ctrl', 'shift', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, 'u');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_shift_alt_v', () => {
      pushKP(['ctrl', 'shift', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, 'v');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_shift_alt_w', () => {
      pushKP(['ctrl', 'shift', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, 'w');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_shift_alt_x', () => {
      pushKP(['ctrl', 'shift', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, 'x');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_shift_alt_y', () => {
      pushKP(['ctrl', 'shift', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, 'y');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_shift_alt_z', () => {
      pushKP(['ctrl', 'shift', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, 'z');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_shift_alt_pageup', () => {
      pushKP(['ctrl', 'shift', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, 'pageup');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_shift_alt_pagedown', () => {
      pushKP(['ctrl', 'shift', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, 'pagedown');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_shift_alt_home', () => {
      pushKP(['ctrl', 'shift', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, 'home');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_shift_alt_end', () => {
      pushKP(['ctrl', 'shift', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, 'end');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_shift_alt_escape', () => {
      pushKP(['ctrl', 'shift', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, 'escape');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_shift_alt_backspace', () => {
      pushKP(['ctrl', 'shift', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, 'backspace');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_shift_alt_left', () => {
      pushKP(['ctrl', 'shift', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, 'left');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_shift_alt_right', () => {
      pushKP(['ctrl', 'shift', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, 'right');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_shift_alt_up', () => {
      pushKP(['ctrl', 'shift', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, 'up');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_shift_alt_down', () => {
      pushKP(['ctrl', 'shift', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, 'down');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_shift_alt_[', () => {
      pushKP(['ctrl', 'shift', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, '[');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_shift_alt_]', () => {
      pushKP(['ctrl', 'shift', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, ']');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_shift_alt_backtick', () => {
      pushKP(['ctrl', 'shift', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, '`');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_shift_alt_;', () => {
      pushKP(['ctrl', 'shift', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, ';');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_shift_alt_squote', () => {
      pushKP(['ctrl', 'shift', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, "'");
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_shift_alt_,', () => {
      pushKP(['ctrl', 'shift', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, ',');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_shift_alt_.', () => {
      pushKP(['ctrl', 'shift', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, '.');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_shift_alt_/', () => {
      pushKP(['ctrl', 'shift', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, '/');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_shift_alt_bslash', () => {
      pushKP(['ctrl', 'shift', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, '\\');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_shift_alt_eq', () => {
      pushKP(['ctrl', 'shift', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, '=');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_shift_alt_-', () => {
      pushKP(['ctrl', 'shift', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, '-');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_shift_alt_1', () => {
      pushKP(['ctrl', 'shift', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, '1');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_shift_alt_2', () => {
      pushKP(['ctrl', 'shift', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, '2');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_shift_alt_3', () => {
      pushKP(['ctrl', 'shift', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, '3');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_shift_alt_4', () => {
      pushKP(['ctrl', 'shift', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, '4');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_shift_alt_5', () => {
      pushKP(['ctrl', 'shift', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, '5');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_shift_alt_6', () => {
      pushKP(['ctrl', 'shift', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, '6');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_shift_alt_7', () => {
      pushKP(['ctrl', 'shift', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, '7');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_shift_alt_8', () => {
      pushKP(['ctrl', 'shift', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, '8');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_shift_alt_9', () => {
      pushKP(['ctrl', 'shift', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, '9');
    }),
    commands.registerCommand('extension.helixKeymap.ctrl_shift_alt_0', () => {
      pushKP(['ctrl', 'shift', 'alt']);
      globalhelixState.typeSubscription(globalhelixState, '0');
    }),
  );

  bindings.loadDefaultConfig();
  config.applyConfig().then(() => {
    ModeEnterFuncs[Mode.Normal](globalhelixState);
    setTypeSubscription(globalhelixState, typeHandler);

    if (vscode.window.activeTextEditor) {
      setModeCursorStyle(globalhelixState.mode, vscode.window.activeTextEditor);
      onDidChangeActiveTextEditor(globalhelixState, vscode.window.activeTextEditor);
    }
  });
}

export function deactivate(): void {
  removeTypeSubscription(globalhelixState);
}
