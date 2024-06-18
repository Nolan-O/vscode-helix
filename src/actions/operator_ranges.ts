import * as vscode from 'vscode';

import { arrayFindLast } from '../array_utils';
import { blockRange } from '../block_utils';
import { HelixState } from '../helix_state_types';
import { indentLevelRange } from '../indent_utils';
import { paragraphBackward, paragraphForward, paragraphRangeInner, paragraphRangeOuter } from '../paragraph_utils';
import { createOperatorRangeExactKeys, createOperatorRangeRegex } from '../parse_keys';
import { OperatorRange } from '../parse_keys_types';
import * as positionUtils from '../position_utils';
import { findQuoteRange, quoteRanges } from '../quote_utils';
import { searchBackward, searchBackwardBracket, searchForward, searchForwardBracket } from '../search_utils';
import { getTags } from '../tag_utils';
import { whitespaceWordRanges, wordRanges } from '../word_utils';

export type OperatorRangeFunc = (vimState: HelixState, editor: vscode.TextEditor) => void

export const outer: { [key: string]: OperatorRangeFunc } = {
  Word: createOuterWordHandler(wordRanges),
  LongWord: createOuterWordHandler(whitespaceWordRanges),

  // TODO: outer paragraph just works like inner paragraph
  Paragraph: (vimState, editor) => {
    editor.selections = editor.selections.map((sel) => {
      const result = paragraphRangeOuter(editor.document, sel.active.line);

      if (result) {
        return new vscode.Selection(
          new vscode.Position(result.start, 0),
          new vscode.Position(result.end, editor.document.lineAt(result.end).text.length),
        );
      } else {
        return sel;
      }
    })
  },

  SurroundingPair: (helixState, editor) => {
    const count = helixState.resolveCount();
    const document = editor.document;
    // Get all ranges from our position then reduce down to the shortest one
    editor.selections = editor.selections.map((sel) => {
      const bracketRange = [
        getBracketRange(document, sel.active, '(', ')', count),
        getBracketRange(document, sel.active, '{', '}', count),
        getBracketRange(document, sel.active, '<', '>', count),
        getBracketRange(document, sel.active, '[', ']', count),
      ].reduce((acc, range) => {
        if (range) {
          if (!acc) {
            return range;
          } else {
            return range.contains(acc) ? acc : range;
          }
        } else {
          return acc;
        }
      }, undefined);

      if (bracketRange == undefined) {
        return sel;
      } else {
        return new vscode.Selection(new vscode.Position(bracketRange.start.line, bracketRange.start.character), new vscode.Position(bracketRange.end.line, bracketRange.end.character + 1))
      }
    })
  },
  Function: createInnerFunctionHandler(),

  Type: (vimState, editor) => {
    const document = editor.document;
    editor.selections = editor.selections.map((sel) => {
      const position = sel.active;
      const tags = getTags(document);

      const closestTag = arrayFindLast(tags, (tag) => {
        const afterStart = position.isAfterOrEqual(tag.opening.start);

        if (tag.closing) {
          return afterStart && position.isBeforeOrEqual(tag.closing.end);
        } else {
          return afterStart && position.isBeforeOrEqual(tag.opening.end);
        }
      });

      if (closestTag) {
        if (closestTag.closing) {
          return new vscode.Selection(
            closestTag.opening.start,
            closestTag.closing.end.with({
              character: closestTag.closing.end.character + 1,
            }),
          );
        } else {
          return new vscode.Selection(
            closestTag.opening.start,
            closestTag.opening.end.with({
              character: closestTag.opening.end.character + 1,
            }),
          );
        }
      } else {
        return sel;
      }
    })
  }
}

export const inner: { [key: string]: OperatorRangeFunc } = {
  Word: createInnerWordHandler(wordRanges),
  LongWord: createInnerWordHandler(whitespaceWordRanges),

  Paragraph: (vimState, editor) => {
    editor.selections = editor.selections.map((sel) => {
      const result = paragraphRangeInner(editor.document, sel.active.line);

      if (result) {
        return new vscode.Selection(
          new vscode.Position(result.start, 0),
          new vscode.Position(result.end, editor.document.lineAt(result.end).text.length),
        );
      } else {
        return sel;
      }
    })
  },

  SurroundingPair: (helixState, editor) => {
    const count = helixState.resolveCount();
    const document = editor.document;
    // Get all ranges from our position then reduce down to the shortest one
    editor.selections = editor.selections.map((sel) => {
      const bracketRange = [
        getBracketRange(document, sel.active, '(', ')', count),
        getBracketRange(document, sel.active, '{', '}', count),
        getBracketRange(document, sel.active, '<', '>', count),
        getBracketRange(document, sel.active, '[', ']', count),
      ].reduce((acc, range) => {
        if (range) {
          if (!acc) {
            return range;
          } else {
            return range.contains(acc) ? acc : range;
          }
        } else {
          return acc;
        }
      }, undefined);

      if (bracketRange == undefined) {
        return sel;
      } else {
        return new vscode.Selection(new vscode.Position(bracketRange.start.line, bracketRange.start.character + 1), new vscode.Position(bracketRange.end.line, bracketRange.end.character))
      }
    })
  },

  Function: createInnerFunctionHandler(),
  Type: (vimState, editor) => {
    const document = editor.document;
    editor.selections = editor.selections.map((sel) => {
      const position = sel.active;
      const tags = getTags(document);

      const closestTag = arrayFindLast(tags, (tag) => {
        if (tag.closing) {
          return position.isAfterOrEqual(tag.opening.start) && position.isBeforeOrEqual(tag.closing.end);
        } else {
          // Self-closing tags have no inside
          return false;
        }
      });

      if (closestTag) {
        if (closestTag.closing) {
          return new vscode.Selection(
            closestTag.opening.end.with({
              character: closestTag.opening.end.character + 1,
            }),
            closestTag.closing.start,
          );
        } else {
          throw new Error('We should have already filtered out self-closing tags above');
        }
      } else {
        return sel;
      }
    })
  },

  // TODO: what is this?
  /*   createOperatorRangeExactKeys(['i', 'i'], true, (vimState, document, position) => {
    const simpleRange = indentLevelRange(document, position.line);
  
    return new vscode.Range(
      new vscode.Position(simpleRange.start, 0),
      new vscode.Position(simpleRange.end, document.lineAt(simpleRange.end).text.length),
    );
  }), */

  // TODO: what is this?
  /*   createOperatorRangeExactKeys(['a', 'b'], true, (vimState, document, position) => {
    const range = blockRange(document, position);
  
    return range;
  }), */
};

// TODO: I can't find the helix equivalent of these
/* export const directional: { [key: string]: OperatorRangeFunc } = {
  wordForward: createWordForwardHandler(wordRanges),
  longWordForward: createWordForwardHandler(whitespaceWordRanges),

  wordBackward: createWordBackwardHandler(wordRanges),
  longWordBackward: createWordBackwardHandler(whitespaceWordRanges),

  wordForwardEnd: createWordEndHandler(wordRanges),
  longWordForwardEnd: createWordEndHandler(whitespaceWordRanges),


  paragraphForward: (vimState, document, position) => {
    return new vscode.Range(
      position.with({ character: 0 }),
      new vscode.Position(paragraphForward(document, position.line), 0),
    );
  },

  paragraphBackward: (vimState, document, position) => {
    return new vscode.Range(
      new vscode.Position(paragraphBackward(document, position.line), 0),
      position.with({ character: 0 }),
    );
  },
}; */



function createInnerBracketHandler(
  openingChar: string,
  closingChar: string,
): (vimState: HelixState, document: vscode.TextDocument, position: vscode.Position) => vscode.Range | undefined {
  return (helixState, document, position) => {
    const count = helixState.resolveCount();
    const bracketRange = getBracketRange(document, position, openingChar, closingChar, count);

    if (bracketRange) {
      return new vscode.Range(
        bracketRange.start.with({
          character: bracketRange.start.character + 1,
        }),
        bracketRange.end,
      );
    } else {
      return undefined;
    }
  };
}

function createOuterBracketHandler(
  openingChar: string,
  closingChar: string,
): (vimState: HelixState, document: vscode.TextDocument, position: vscode.Position) => vscode.Range | undefined {
  return (helixState, document, position) => {
    const count = helixState.resolveCount();
    const bracketRange = getBracketRange(document, position, openingChar, closingChar, count);

    if (bracketRange) {
      return new vscode.Range(bracketRange.start, bracketRange.end.with({ character: bracketRange.end.character + 1 }));
    } else {
      return undefined;
    }
  };
}

function getBracketRange(
  document: vscode.TextDocument,
  position: vscode.Position,
  openingChar: string,
  closingChar: string,
  offset?: number,
): vscode.Range | undefined {
  const lineText = document.lineAt(position.line).text;
  const currentChar = lineText[position.character];

  let start;
  let end;
  if (currentChar === openingChar) {
    start = position;
    end = searchForwardBracket(document, openingChar, closingChar, positionUtils.rightWrap(document, position), offset);
  } else if (currentChar === closingChar) {
    start = searchBackwardBracket(
      document,
      openingChar,
      closingChar,
      positionUtils.leftWrap(document, position),
      offset,
    );
    end = position;
  } else {
    start = searchBackwardBracket(document, openingChar, closingChar, position, offset);
    end = searchForwardBracket(document, openingChar, closingChar, position, offset);
  }

  if (start && end) {
    return new vscode.Range(start, end);
  } else {
    return undefined;
  }
}

function createInnerQuoteHandler(
  quoteChar: string,
): (vimState: HelixState, document: vscode.TextDocument, position: vscode.Position) => vscode.Range | undefined {
  return (vimState, document, position) => {
    const lineText = document.lineAt(position.line).text;
    const ranges = quoteRanges(quoteChar, lineText);
    const result = findQuoteRange(ranges, position);

    if (result) {
      return new vscode.Range(position.with({ character: result.start + 1 }), position.with({ character: result.end }));
    } else {
      return undefined;
    }
  };
}

function createOuterQuoteHandler(
  quoteChar: string,
): (vimState: HelixState, document: vscode.TextDocument, position: vscode.Position) => vscode.Range | undefined {
  return (vimState, document, position) => {
    const lineText = document.lineAt(position.line).text;
    const ranges = quoteRanges(quoteChar, lineText);
    const result = findQuoteRange(ranges, position);

    if (result) {
      return new vscode.Range(position.with({ character: result.start }), position.with({ character: result.end + 1 }));
    } else {
      return undefined;
    }
  };
}

function createWordForwardHandler(
  wordRangesFunction: (text: string) => { start: number; end: number }[],
): (vimState: HelixState, document: vscode.TextDocument, position: vscode.Position) => vscode.Range {
  return (vimState, document, position) => {
    const lineText = document.lineAt(position.line).text;
    const ranges = wordRangesFunction(lineText);

    const result = ranges.find((x) => x.start > position.character);

    if (result) {
      return new vscode.Range(position, position.with({ character: result.start }));
    } else {
      return new vscode.Range(position, position.with({ character: lineText.length }));
    }
  };
}

function createWordBackwardHandler(
  wordRangesFunction: (text: string) => { start: number; end: number }[],
): (vimState: HelixState, document: vscode.TextDocument, position: vscode.Position) => vscode.Range | undefined {
  return (vimState, document, position) => {
    const lineText = document.lineAt(position.line).text;
    const ranges = wordRangesFunction(lineText);

    const result = ranges.reverse().find((x) => x.start < position.character);

    if (result) {
      return new vscode.Range(position.with({ character: result.start }), position);
    } else {
      return undefined;
    }
  };
}

function createWordEndHandler(
  wordRangesFunction: (text: string) => { start: number; end: number }[],
): (vimState: HelixState, document: vscode.TextDocument, position: vscode.Position) => vscode.Range | undefined {
  return (vimState, document, position) => {
    const lineText = document.lineAt(position.line).text;
    const ranges = wordRangesFunction(lineText);

    const result = ranges.find((x) => x.end > position.character);

    if (result) {
      return new vscode.Range(position, positionUtils.right(document, position.with({ character: result.end })));
    } else {
      return undefined;
    }
  };
}

function createInnerWordHandler(
  wordRangesFunction: (text: string) => { start: number; end: number }[],
): (vimState: HelixState, editor: vscode.TextEditor) => void {
  return (vimState, editor) => {
    const document = editor.document;
    editor.selections = editor.selections.map((sel) => {
      const position = sel.active;
      const lineText = document.lineAt(position.line).text;
      const ranges = wordRangesFunction(lineText);

      const result = ranges.find((x) => x.start <= position.character && position.character <= x.end);

      if (result) {
        return new vscode.Selection(
          position.with({ character: result.start }),
          positionUtils.right(document, position.with({ character: result.end })),
        );
      } else {
        return sel;
      }
    });
  };
}

function createOuterWordHandler(
  wordRangesFunction: (text: string) => { start: number; end: number }[],
): (vimState: HelixState, editor: vscode.TextEditor) => void {
  return (vimState, editor) => {
    const document = editor.document;
    editor.selections = editor.selections.map((sel) => {
      const position = sel.active;
      const lineText = document.lineAt(position.line).text;
      // TODO: pretty wasteful to get the ranges of all words on every line of every selection
      // and then find the one that is around our selection
      const ranges = wordRangesFunction(lineText);

      for (let i = 0; i < ranges.length; ++i) {
        const range = ranges[i];

        if (range.start <= position.character && position.character <= range.end) {
          if (i < ranges.length - 1) {
            return new vscode.Selection(
              position.with({ character: range.start }),
              position.with({ character: ranges[i + 1].start }),
            );
          } else if (i > 0) {
            return new vscode.Selection(
              positionUtils.right(document, position.with({ character: ranges[i - 1].end })),
              positionUtils.right(document, position.with({ character: range.end })),
            );
          } else {
            return new vscode.Selection(
              position.with({ character: range.start }),
              positionUtils.right(document, position.with({ character: range.end })),
            );
          }
        }
      }

      return sel;
    })

    return undefined;
  };
}

/*
 * Implements going to nearest matching brackets from the cursor.
 * This will need to call the other `createInnerBracketHandler` functions and get the smallest range from them.
 * This should ensure that we're fetching the nearest bracket pair.
 **/
function createInnerMatchHandler(): (
  helixState: HelixState,
  document: vscode.TextDocument,
  position: vscode.Position,
) => vscode.Range | undefined {
  return (helixState, document, position) => {
    const count = helixState.resolveCount();
    // Get all ranges from our position then reduce down to the shortest one
    const bracketRange = [
      getBracketRange(document, position, '(', ')', count),
      getBracketRange(document, position, '{', '}', count),
      getBracketRange(document, position, '<', '>', count),
      getBracketRange(document, position, '[', ']', count),
    ].reduce((acc, range) => {
      if (range) {
        if (!acc) {
          return range;
        } else {
          return range.contains(acc) ? acc : range;
        }
      } else {
        return acc;
      }
    }, undefined);

    return bracketRange?.with(new vscode.Position(bracketRange.start.line, bracketRange.start.character + 1));
  };
}

/*
 * Implements going to nearest matching brackets from the cursor.
 * This will need to call the other `createInnerBracketHandler` functions and get the smallest range from them.
 * This should ensure that we're fetching the nearest bracket pair.
 **/
function createOuterMatchHandler(): (
  vimState: HelixState,
  document: vscode.TextDocument,
  position: vscode.Position,
) => vscode.Range | undefined {
  return (_, document, position) => {
    // Get all ranges from our position then reduce down to the shortest one
    const bracketRange = [
      getBracketRange(document, position, '(', ')'),
      getBracketRange(document, position, '{', '}'),
      getBracketRange(document, position, '<', '>'),
      getBracketRange(document, position, '[', ']'),
    ].reduce((acc, range) => {
      if (range) {
        if (!acc) {
          return range;
        } else {
          return range.contains(acc) ? acc : range;
        }
      } else {
        return acc;
      }
    }, undefined);

    return bracketRange?.with(undefined, new vscode.Position(bracketRange.end.line, bracketRange.end.character + 1));
  };
}

function createInnerFunctionHandler(): (vimState: HelixState, editor: vscode.TextEditor) => void {
  return (helixState, editor: vscode.TextEditor) => {
    editor.selections = editor.selections.map((sel) => {
      const position = sel.active;
      const range = helixState.symbolProvider.getContainingSymbolRange(position);

      if (range) {
        return new vscode.Selection(
          range.start.line, range.start.character,
          range.end.line, range.end.character
        );
      } else {
        return sel;
      }
    })
  };
}



// createOperatorRangeExactKeys(
//   [KeyMap.Motions.MoveRight],
//   false,
//   (vimState, document, position) => {
//     const right = positionUtils.right(document, position);

//     if (right.isEqual(position)) {
//       return undefined;
//     } else {
//       return new vscode.Range(position, right);
//     }
//   }
// ),
// createOperatorRangeExactKeys(
//   [KeyMap.Motions.MoveLeft],
//   false,
//   (vimState, document, position) => {
//     const left = positionUtils.left(position);

//     if (left.isEqual(position)) {
//       return undefined;
//     } else {
//       return new vscode.Range(position, left);
//     }
//   }
// ),
// createOperatorRangeExactKeys(
//   [KeyMap.Motions.MoveUp],
//   true,
//   (vimState, document, position) => {
//     if (position.line === 0) {
//       return new vscode.Range(
//         new vscode.Position(0, 0),
//         positionUtils.lineEnd(document, position)
//       );
//     } else {
//       return new vscode.Range(
//         new vscode.Position(position.line - 1, 0),
//         positionUtils.lineEnd(document, position)
//       );
//     }
//   }
// ),

// createOperatorRangeExactKeys(
//   [KeyMap.Motions.MoveDown],
//   true,
//   (vimState, document, position) => {
//     if (position.line === document.lineCount - 1) {
//       return new vscode.Range(
//         new vscode.Position(position.line, 0),
//         positionUtils.lineEnd(document, position)
//       );
//     } else {
//       return new vscode.Range(
//         new vscode.Position(position.line, 0),
//         positionUtils.lineEnd(
//           document,
//           position.with({ line: position.line + 1 })
//         )
//       );
//     }
//   }
// ),