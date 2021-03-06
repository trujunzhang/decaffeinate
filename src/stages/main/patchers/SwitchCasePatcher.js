import NodePatcher from '../../../patchers/NodePatcher.js';
import type { Editor, Node, ParseContext, SourceToken } from '../../../patchers/types.js';
import { BREAK, COMMA, THEN, WHEN } from 'coffee-lex';

export default class SwitchCasePatcher extends NodePatcher {
  conditions: Array<NodePatcher>;
  consequent: ?NodePatcher;
  
  constructor(node: Node, context: ParseContext, editor: Editor, conditions: Array<NodePatcher>, consequent: NodePatcher) {
    super(node, context, editor);
    this.conditions = conditions;
    this.consequent = consequent;
  }

  initialize() {
    this.conditions.forEach(condition => condition.setRequiresExpression());
  }

  patchAsStatement() {
    // `when a, b, c then d` → `a, b, c then d`
    //  ^^^^^
    let whenToken = this.getWhenToken();
    this.remove(whenToken.start, this.conditions[0].contentStart);

    // `a, b, c then d` → `a b c then d`
    //   ^  ^
    this.getCommaTokens().forEach(comma => {
      this.remove(comma.start, comma.end);
    });

    this.conditions.forEach(condition => {
      // `a b c then d` → `case a: case b: case c: then d`
      //                   ^^^^^ ^^^^^^^ ^^^^^^^ ^
      this.insert(condition.outerStart, 'case ');
      condition.patch({ leftBrace: false, rightBrace: false });
      this.insert(condition.outerEnd, ':');
    });


    // `case a: case b: case c: then d → `case a: case b: case c: d`
    //                          ^^^^^
    let thenToken = this.getThenToken();
    if (thenToken) {
      if (this.consequent !== null) {
        this.remove(thenToken.start, this.consequent.contentStart);
      } else {
        this.remove(thenToken.start, thenToken.end);
      }
    }

    if (this.consequent !== null) {
      this.consequent.patch({ leftBrace: false, rightBrace: false });
    }

    let hasBreak = this.getBreakToken() !== null;
    let implicitReturnWillBreak = (
      this.implicitlyReturns() &&
      this.implicitReturnWillBreak() &&
      (!this.consequent || this.consequent.allCodePathsPresent())
    );
    let shouldAddBreak = !hasBreak && !implicitReturnWillBreak;
    if (shouldAddBreak) {
      if (thenToken) {
        // `case a: case b: case c: then d → `case a: case b: case c: d break`
        //                                                             ^^^^^^
        if (this.consequent !== null) {
          this.insert(this.consequent.contentEnd, ' break');
        } else {
          this.insert(thenToken.end, ' break');
        }
      } else {
        this.appendLineAfter('break', 1);
      }
    }
  }

  setImplicitlyReturns() {
    super.setImplicitlyReturns();
    if (this.consequent !== null) {
      this.consequent.setImplicitlyReturns();
    }
  }

  patchAsExpression() {
    this.patchAsStatement();
  }

  negate() {
    this.conditions.forEach(condition => condition.negate());
  }

  /**
   * @private
   */
  getWhenToken(): SourceToken {
    let whenToken = this.sourceTokenAtIndex(this.contentStartTokenIndex);
    if (!whenToken) {
      throw this.error(`bad token index for start of 'when'`);
    }
    if (whenToken.type !== WHEN) {
      throw this.error(`unexpected ${whenToken.type.name} at start of 'switch' case`);
    }
    return whenToken;
  }

  /**
   * @private
   */
  getCommaTokens(): Array<SourceToken> {
    let result = [];
    for (let i = 1; i < this.conditions.length; i++) {
      let left = this.conditions[i - 1];
      let right = this.conditions[i];
      let commaIndex = this.indexOfSourceTokenBetweenPatchersMatching(
        left, right, token => token.type === COMMA
      );
      if (!commaIndex) {
        throw this.error(
          `unable to find comma between 'when' conditions`,
          left.contentEnd,
          right.contentStart
        );
      }
      result.push(this.sourceTokenAtIndex(commaIndex));
    }
    return result;
  }

  /**
   * @private
   */
  getBreakToken(): ?SourceToken {
    let lastToken = this.sourceTokenAtIndex(this.contentEndTokenIndex);
    if (lastToken && lastToken.type === BREAK) {
      return lastToken;
    } else {
      return null;
    }
  }

  /**
   * Gets the token representing the `then` between condition and consequent.
   *
   * @private
   */
  getThenToken(): ?SourceToken {
    let thenTokenIndex = this.indexOfSourceTokenBetweenSourceIndicesMatching(
      this.conditions[0].outerEnd,
      this.consequent !== null ? this.consequent.outerStart : this.contentEnd,
      token => token.type === THEN
    );
    return thenTokenIndex ? this.sourceTokenAtIndex(thenTokenIndex) : null;
  }
}
