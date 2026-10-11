# Word-wrap text to a width

Write `wrapText(text, width)`. It breaks the text into lines of at most `width` characters and returns
the lines as an array of strings.

## Rules

- The words of the text are its runs of non-whitespace characters. Any whitespace (spaces, tabs, newlines),
  in any amount, only separates words: it is never copied to the output.
- Words are packed **greedily**: a word goes on the current line if the line, a single space and the word
  together still fit in `width` characters; otherwise it starts a new line. Words on a line are joined by
  exactly one space, and no line has leading or trailing spaces.
- A word that is **longer than `width`** is broken into pieces of exactly `width` characters, the last piece
  possibly shorter. Such a word always starts on a new line (the current line is finished first), every full
  piece is a line of its own, and the last piece becomes the current line, so following words may continue
  on it.
- Text with no words (empty or only whitespace) gives an empty array `[]`.

## Errors

- If `text` is not a string, throw a `TypeError`.
- If `width` is not an integer of at least 1, throw a `RangeError`. (Check `text` first.)

## Examples

```
wrapText("the quick brown fox", 10)   // ["the quick", "brown fox"]
wrapText("a  b\n\nc", 3)             // ["a b", "c"]
wrapText("abcdefgh ij", 3)            // ["abc", "def", "gh", "ij"]
wrapText("abcde fg", 3)               // ["abc", "de", "fg"]
```

## Output

Write the file `solution.mjs`. It must export `wrapText`.
