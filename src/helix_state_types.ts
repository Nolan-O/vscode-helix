import type { Disposable, TextDocument } from 'vscode';
import { Range, TextEditor } from 'vscode';
import type { SymbolProvider } from './SymbolProvider';
import { CommandLine } from './commandLine';
import { Mode } from './modes';
import { SearchState } from './search';
import { MotionWrapper } from './actions/motions';

/** This represents the global Helix state used across the board */
export type HelixState = {
  typeSubscriptionDisposable: Disposable | undefined;
  typeSubscription: (vimState: HelixState, char: string) => void;
  mode: Mode;
  keysPressed: string[];
  numbersPressed: string[];
  resolveCount: () => number;
  registers: {
    contentsList: (string | undefined)[];
    linewise: boolean;
  };
  symbolProvider: SymbolProvider;
  editorState: {
    activeEditor: TextEditor | undefined;
    previousEditor: TextEditor | undefined;
    lastModifiedDocument: TextDocument | undefined;
  };
  commandLine: CommandLine;
  commandContents: string;
  searchState: SearchState;
  /**
   * The current range we're searching in when calling select
   * This is better kept on the global state as it's used for multiple things
   */
  currentSelection: Range | null;
  repeatLastMotion: (vimState: HelixState, editor: TextEditor) => void;
  /**
   * If a mode can represent multiple motions depending on which action triggered the mode, you can
   * specify a MotionWrapper for the associated type hanlder to use here
   * Set this upon entering the mode, as an argument from the action to the mode-entering function in modes.ts
   */
  motionForMode: MotionWrapper | null;
  previousMode: Mode | undefined;
  lastPutRanges: {
    ranges: (Range | undefined)[];
    linewise: boolean;
  };
};
