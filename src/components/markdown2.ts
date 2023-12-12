import _ from 'lodash';


enum MarkdownCommand {
    PARAGRAPH = 'p',
    END_PARAGRAPH = 'endp',
    HEADING = 'h',
    CHECKBOX_LABEL = 'label',
    BLOCKQUOTE = 'blockquote',
    LIST = 'l',
    LIST_ITEM = 'li',
    TABLE = 'table'
}

interface MarkdownCommandProperties {
    // [Required] The regex that triggers the start of this command.
    regex: RegExp | null;
    // [Required] Can this command continue after the current line?
    multiline: boolean;
    // [Required] Does this command allow other commands to begin after it?
    stackable: boolean;
    // [Optional] Does this command need to be repeated to be continued across lines?
    // - Only applies if multiline.
    // - Mutually exclusive with `shouldContinue`.
    // - Superseded by `shouldContinue`.
    repeated?: boolean;
    // [Optional] Custom logic to decide if the command should be continued
    // - Only applies if multiline.
    // - Mutually exclusive with `repeated`.
    // - Takes priority over `repeated`.
    shouldContinue?: () => boolean;

    // Events
    onMatch?: (render_state: MarkdownRenderState, match: RegExpMatchArray) => MarkdownCommandInstance[];
    onStart?: (
        render_state: MarkdownRenderState,
        cmd_state: any
    ) => void;
    onEnd?: (
        render_state: MarkdownRenderState,
        cmd_state: any
    ) => void;
    onTextLine?: (
        render_state: MarkdownRenderState,
        cmd_state: any,
        line: string,
        text: string
    ) => void;
}

const MARKDOWN_COMMANDS: Record<MarkdownCommand, MarkdownCommandProperties> = {
    [MarkdownCommand.PARAGRAPH]: {
        regex: /^[^\s\\`*_{}[\]<>()#+\-.!|]/,
        multiline: true,
        repeated: true,
        stackable: false
    },
    [MarkdownCommand.END_PARAGRAPH]: {
        regex: /^\s*$/,
        multiline: false,
        stackable: false
    },
    [MarkdownCommand.HEADING]: {
        regex: /^\s*#{1,6}/,
        multiline: false,
        stackable: false
    },
    [MarkdownCommand.CHECKBOX_LABEL]: {
        regex: /^\s*- \[([ x])]/,
        multiline: false,
        stackable: false,
    },
    [MarkdownCommand.BLOCKQUOTE]: {
        regex: /^\s*>/,
        multiline: true,
        stackable: true,
        repeated: true
    },
    [MarkdownCommand.LIST]: {
        regex: null,
        multiline: true,
        stackable: true
    },
    [MarkdownCommand.LIST_ITEM]: {
        regex: /\s*((:? {4})*)([0-9]+\.|-)/,
        multiline: true,
        stackable: true
    },
    [MarkdownCommand.TABLE]: {
        regex: / /,
        multiline: true,
        stackable: false,
        repeated: true
    }
};

interface MarkdownCommandInstance {
    type: MarkdownCommand;
    state: object;
}

class MarkdownRenderState {
    private _id: number;
    private _html: string;
    private readonly _commandStack: MarkdownCommandInstance[];

    constructor() {
        this._id = 0;
        this._html = '';
        this._commandStack = [];
    }

    public uniqueId() {
        return this._id++;
    }

    public pushCommand(cmd: MarkdownCommand, state?: object) {
        const instance = {
            type: cmd,
            state: state ?? {}
        };
        this._commandStack.push(instance);
        MARKDOWN_COMMANDS[cmd].onStart?.call(undefined, this, instance.state);
    }

    public popCommand() {
        const instance = this._commandStack.pop();
        if (instance) {
            MARKDOWN_COMMANDS[instance.type].onEnd?.call(undefined, this, instance.state);
        }
    }

    public peekCommand(): MarkdownCommandInstance | undefined {
        return _.last(this._commandStack);
    }

    public peekCommands(n: number) {
        return this._commandStack.slice(-n);
    }

    public renderText(text: string, escaped?: boolean) {
        this._html += `${text}\n`;
    }

    public renderOpeningTag(tag: string, attributes?: Record<string, string | boolean>, selfClosing = false) {
        const props = Object.entries(attributes ?? {})
            .map(([k, v]) => {
                if (_.isNil(v) || v === false) {
                    return '';
                }
                if (v === true) {
                    return k;
                }
                return `${k}="${v}"`;
            })
            .join(' ');
        this._html += `<${tag}${props ? ` ${props}` : ''}${selfClosing ? '/' : ''}>\n`;
    }

    public renderClosingTag(tag: string) {
        this._html += `</${tag}>\n`;
    }
}


export class MarkdownRenderer {
    private readonly _input: string;
    private _cursor: number;
    private readonly _state: MarkdownRenderState;

    constructor(input: string) {
        this._input = input;
        this._cursor = 0;
        this._state = new MarkdownRenderState();
    }

    public render() {
        while (this._cursor < this._input.length) {
            const remaining = this._input.substring(this._cursor);
            const cr = remaining.indexOf('\n');
            const end = cr >= 0 ? cr : remaining.length;
            const [line, text] = this._lineCommands(remaining.substring(0, end));



            const instance = this._state.peekCommand();
            if (instance) {
                MARKDOWN_COMMANDS[instance.type].onTextLine
                    ?.call(undefined, this._state, instance.state, line, text);
            }
            this._cursor += line.length;
        }
    }

    private _lineCommands(line: string) {
        const originalLine = line;
        let hasNext = false;
        do {
            for (const _cmd in MARKDOWN_COMMANDS) {
                const cmd = _cmd as MarkdownCommand;
                const props = this._properties(cmd);
                let match: RegExpMatchArray | null;
                if (props.regex && (match = line.match(props.regex)) !== null) {
                    if (props.onMatch) {
                        props.onMatch(this._state, match);
                    } else {
                        this._state.pushCommand(cmd);
                    }
                    hasNext = props.stackable;
                    break;
                }
            }
        } while(hasNext);
        return [originalLine, line];
    }

    private _properties(cmd: MarkdownCommand) {
        return MARKDOWN_COMMANDS[cmd];
    }
}
