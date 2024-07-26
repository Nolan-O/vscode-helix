const NON_WORD_CHARACTERS = '/\\()"\':,.;<>~!@#$%^&*|+=[]{}`?-';

export function whitespaceWordRanges(text: string): { start: number; end: number }[] {
  enum State {
    Whitespace,
    Word,
  }

  let state = State.Word;
  let startIndex = 0;
  const ranges = [];

  for (let i = 0; i < text.length; ++i) {
    const char = text[i];

    if (state === State.Whitespace) {
      if (!isWhitespaceCharacter(char)) {
        ranges.push({
          start: startIndex,
          end: i - 1,
        });
        startIndex = i;
        state = State.Word;
      }
    } else {
      if (isWhitespaceCharacter(char)) {
        state = State.Whitespace;
      }
    }
  }

  ranges.push({
    start: startIndex,
    end: text.length - 1,
  });

  return ranges;
}

export function wordRanges(text: string): { start: number; end: number }[] {
  enum State {
    Whitespace,
    Word,
    NonWord,
  }

  let state = State.Word;
  let startIndex = 0;
  const ranges = [];

  for (let i = 0; i < text.length; ++i) {
    const char = text[i];

    if (state === State.Whitespace) {
      if (!isWhitespaceCharacter(char)) {
        ranges.push({
          start: startIndex,
          end: i - 1,
        });

        startIndex = i;
        state = isWordCharacter(char) ? State.Word : State.NonWord;
      }
    } else if (state === State.Word) {
      if (!isWordCharacter(char)) {
        ranges.push({
          start: startIndex,
          end: i - 1,
        });

        if (isWhitespaceCharacter(char)) {
          state = State.Whitespace;
        } else {
          state = State.NonWord;
          startIndex = i;
        }
      } else if (isWhitespaceCharacter(char)) {
        state = State.Whitespace;
      }
    } else {
      if (!isWhitespaceCharacter(char) && !isNonWordCharacter(char)) {
        ranges.push({
          start: startIndex,
          end: i - 1,
        });

        startIndex = i;
        state = isWordCharacter(char) ? State.Word : State.NonWord;
      }
    }
  }

  if (state !== State.Whitespace) {
    ranges.push({
      start: startIndex,
      end: text.length - 1,
    });
  }

  return ranges;
}

function isNonWordCharacter(char: string): boolean {
  return NON_WORD_CHARACTERS.includes(char);
}

function isWhitespaceCharacter(char: string): boolean {
  return char === ' ' || char === '\t' || char === '\n';
}

// This function thinks of words in terms of how to define them for motions
// In helix, moving to the next word's start/end will require the previous word to be defined
// up until the trailing whitespace runs into the next word, except for if it's a new line
function isWordCharacter(char: string): boolean {
  return !(char == '\n') && !isNonWordCharacter(char);
}
