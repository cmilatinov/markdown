import _ from 'lodash';
import {escapeHTML} from '@/composables/utils';


enum MarkdownCommand {
    PARAGRAPH = 'p',
    HEADING = 'h',
    CHECKBOX_LABEL = 'label',
    BLOCKQUOTE = 'blockquote',
    LIST = 'l',
    LIST_ITEM = 'li',
    TABLE = 'table',
    CODE_BLOCK = 'code',
}

interface MarkdownCommandProperties {
    // [Required] The regex that triggers the start of this command.
    regex: RegExp | null;
    // [Required] Can this command continue after the current line?
    multiline: boolean;
    // [Required] Does this command allow other commands to begin after it?
    stackable: boolean;

    // Events
    isEqualToFirst?: (
        cmd_state: any,
        stack: MarkdownCommandInstance[],
        newStack: MarkdownCommandInstance[]
    ) => boolean;
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
        text: string
    ) => void;
}

const MARKDOWN_COMMANDS: Record<MarkdownCommand, MarkdownCommandProperties> = {
    [MarkdownCommand.CHECKBOX_LABEL]: {
        regex: /^[^\S\n]*- \[([ x])]/,
        multiline: false,
        stackable: false,
        isEqualToFirst: () => false,
        onMatch: (state, match) => [{
            type: MarkdownCommand.CHECKBOX_LABEL,
            state: {id: state.uniqueId(), checked: match[1] === 'x', label: ''}
        }],
        onTextLine: (_, cmd, text) => {
            cmd.label = text;
        },
        onEnd: (state, cmd) => {
            const id = `input_checkbox_${cmd.id}`;
            state.renderOpeningTag('input', {id, type: 'checkbox', checked: cmd.checked}, true);
            state.renderOpeningTag('label', {for: id});
            state.renderText(cmd.label.trim());
            state.renderClosingTag('label');
            state.renderOpeningTag('br');
        }
    },
    [MarkdownCommand.BLOCKQUOTE]: {
        regex: /^[^\S\n]*>/,
        multiline: true,
        stackable: true,
        onStart: (state) => {
            state.renderOpeningTag('blockquote');
        },
        onEnd: (state) => {
            state.renderClosingTag('blockquote');
        }
    },
    [MarkdownCommand.LIST]: {
        regex: null,
        multiline: true,
        stackable: true,
        isEqualToFirst: (cmd, stack, newStack) => {
            const isLast = newStack.map(c => c.type).lastIndexOf(MarkdownCommand.LIST) === 0;
            return !isLast || _.isEqual(stack[0]?.state, cmd);
        },
        onStart: (state, cmd) => {
            const tag = cmd.ordered ? 'ol' : 'ul';
            state.renderOpeningTag(tag);
        },
        onEnd: (state, cmd) => {
            const tag = cmd.ordered ? 'ol' : 'ul';
            state.renderClosingTag(tag);
        }
    },
    [MarkdownCommand.LIST_ITEM]: {
        regex: /^((:? {4})*)[^\S\n]*([0-9]+\.|-)/,
        multiline: true,
        stackable: false,
        isEqualToFirst: (cmd, stack, newStack) => {
            const isLast = newStack.map(c => c.type).lastIndexOf(MarkdownCommand.LIST_ITEM) === 0;
            return !isLast || _.isEqual(stack[0]?.state, cmd);
        },
        onMatch: (state, match) => {
            const indent = (match[1]?.length ?? 0) / 4;
            return [...Array(indent + 1)].map(() => [
                {type: MarkdownCommand.LIST, state: {ordered: match[3]?.endsWith('.')}},
                {type: MarkdownCommand.LIST_ITEM, state: {id: state.uniqueId()}}
            ])
                .flat();
        },
        onStart: (state) => {
            state.renderOpeningTag('li');
        },
        onTextLine: (state, _, text) => {
            state.renderText(text);
        },
        onEnd: (state) => {
            state.renderClosingTag('li');
        }
    },
    [MarkdownCommand.TABLE]: {
        regex: /^[^\S\n]*\|/,
        multiline: true,
        stackable: false,
        onMatch: () => [{
            type: MarkdownCommand.TABLE,
            state: {rows: []}
        }],
        onTextLine: (_, cmd, text) => {
            cmd.rows.push(`|${text}`);
        },
        onEnd: (state, cmd) => {
            if (!state.renderTable(cmd.rows)) {
                state.renderOpeningTag('p');
                state.renderText(cmd.rows.join('<br>'));
                state.renderClosingTag('p');
            }
        }
    },
    [MarkdownCommand.CODE_BLOCK]: {
        regex: /^[^\S\n]*```([\s\S]*?)```/,
        multiline: true,
        stackable: false,
        onMatch: (_, match) => [{
            type: MarkdownCommand.CODE_BLOCK,
            state: {
                code: match[1].trim()
            }
        }],
        onEnd: (state, cmd) => {
            state.renderOpeningTag('pre');
            state.renderOpeningTag('code', undefined, false, false);
            state.renderText(cmd.code, true);
            state.renderClosingTag('code', false);
            state.renderClosingTag('pre');
        }
    },
    [MarkdownCommand.HEADING]: {
        regex: /^[^\S\n]*(#{1,6})(.*?)(\{.*})?(?=\n|$)/,
        multiline: false,
        stackable: false,
        isEqualToFirst: () => false,
        onMatch: (_, match) => [{
            type: MarkdownCommand.HEADING,
            state: {
                n: match[1].length,
                text: match[2],
                id: match[3] ? match[3].substring(1, match[3].length - 1) : undefined
            }
        }],
        onEnd: (state, cmd) => {
            state.renderOpeningTag(`h${cmd.n}`, {id: cmd.id});
            state.renderText(cmd.text);
            state.renderClosingTag(`h${cmd.n}`);
        }
    },
    [MarkdownCommand.PARAGRAPH]: {
        regex: /^[^\S\n]*(?=\S)/,
        multiline: true,
        stackable: false,
        onMatch: () => [{type: MarkdownCommand.PARAGRAPH, state: {text: ''}}],
        onTextLine: (_, cmd, text) => {
            cmd.text += `${text}\n`;
        },
        onEnd: (state, cmd) => {
            state.renderOpeningTag('p');
            state.renderText(cmd.text);
            state.renderClosingTag('p');
        }
    }
};

const MD_TABLE_CELL_REGEX = /^\s*([^|:]*)\s*\|/;
const MD_TABLE_SEPARATOR_REGEX = /^\s*(:?-+:?)\s*\|/;

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

    public pushCommand(instance: MarkdownCommandInstance) {
        this._commandStack.push(instance);
        this._properties(instance.type).onStart
            ?.call(undefined, this, instance.state);
    }

    public popCommand() {
        const instance = this._commandStack.pop();
        if (instance) {
            this._properties(instance.type).onEnd
                ?.call(undefined, this, instance.state);
        }
    }

    public peekCommand(): MarkdownCommandInstance | undefined {
        return _.last(this._commandStack);
    }

    public peekCommands(n?: number) {
        return this._commandStack.slice(n ? -n : 0);
    }

    public renderText(text: string, escaped?: boolean) {
        if (!escaped) {
            let match;
            while ((match = text.match(/!\[(.*?)]\((.*?)\)(\{.*?})?/)) !== null) {
                let rendered_text = '';
                const id = match[3] ? `id="${match[3].substring(1, match[3].length - 1)}"` : '';
                if (match[1] == '') {
                    rendered_text = `<img src="${match[2]}" ${id}/>`;
                } else {
                    rendered_text = `<figure><img src="${match[2]}" alt="${match[1]}" ${id}/><figcaption>${match[1]}</figcaption></figure>`;
                }
                text = text.substring(0, match.index) + rendered_text + text.substring((match.index ?? 0) + match[0].length);
                console.log(match);
                console.log(text);
            }

            text = text
                .replace(/\*\*([\S\s]*?)\*\*/g, '<b>$1</b>')
                .replace(/__([\S\s]*?)__/g, '<ins>$1</ins>')
                .replace(/==([\S\s]*?)==/g, '<mark>$1</mark>')
                .replace(/~~([\S\s]*?)~~/g, '<del>$1</del>')
                .replace(/\*([\S\s]*?)\*/g, '<i>$1</i>')
                .replace(/_([\S\s]*?)_/g, '<sub>$1</sub>')
                .replace(/\^([\S\s]*?)\^/g, '<sup>$1</sup>')
                .replace(/`([\S\s]*?)`/g, '<code>$1</code>')
                .replace(/\[(.*)]\((.*?)\)/g, '<a href="$2">$1</a>')
                .replace(/ {2,}\n/g, '<br>')
                .replace(/\\([\\`*_{}[\]<>()#+-.!|])/g, '$1');
        } else {
            text = escapeHTML(text);
        }
        this._html += `${text}\n`;
    }

    public renderOpeningTag(
        tag: string,
        attributes?: Record<string, string | boolean>,
        selfClosing = false,
        whitespace = true
    ) {
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
        this._html += `<${tag}${props ? ` ${props}` : ''}${selfClosing ? '/' : ''}>${whitespace ? '\n' : ''}`;
    }

    public renderClosingTag(tag: string, whitespace = true) {
        this._html += `</${tag}>${whitespace ? '\n' : ''}`;
    }

    public renderTable(rows: string) {
        if (rows.length < 2) {
            return false;
        }

        const headers = this._parseTableCells(rows[0], MD_TABLE_CELL_REGEX);
        const separators = this._parseTableCells(rows[1], MD_TABLE_SEPARATOR_REGEX);
        const alignment = separators.map(s => {
            const sep = s.trim();
            const left = sep.startsWith(':');
            const right = sep.endsWith(':');
            if (left && !right) {
                return 'left'
            } else if (!left && right) {
                return 'right';
            } else if (left && right) {
                return 'center';
            }
            return 'left';
        });
        if (separators.length !== headers.length) {
            return false;
        }

        const table = [];
        let failed = false;
        for (let i = 2; i < rows.length; i++) {
            const cells = this._parseTableCells(rows[i], MD_TABLE_CELL_REGEX);
            if (cells.length !== headers.length) {
                failed = true;
                break;
            } else {
                table.push(cells);
            }
        }

        if (failed) {
            return false;
        }

        this.renderOpeningTag('table');
        this.renderOpeningTag('thead');
        this.renderOpeningTag('tr');
        headers.forEach((h, i) => {
            const style = `text-align: ${alignment[i]};`;
            this.renderOpeningTag('th', {style});
            this.renderText(h.trim());
            this.renderClosingTag('th');
        });
        this.renderClosingTag('tr');
        this.renderClosingTag('thead');

        this.renderOpeningTag('tbody');
        table.forEach((r) => {
            this.renderOpeningTag('tr');
            r.forEach((c, i) => {
                const style = `text-align: ${alignment[i]};`;
                this.renderOpeningTag('td', {style});
                this.renderText(c);
                this.renderClosingTag('td');
            });
            this.renderClosingTag('tr');
        });
        this.renderClosingTag('tbody');
        this.renderClosingTag('table');

        return true;
    }

    private _parseTableCells(row: string, regex: RegExp) {
        row = row.substring(1);
        const cells = [];
        let match: RegExpMatchArray | null;
        while (row.length > 0 && (match = row.match(regex)) != null) {
            cells.push(match[1]);
            row = row.substring(match[0].length);
        }
        return cells;
    }

    public html() {
        return this._html;
    }

    private _properties(cmd: MarkdownCommand) {
        return MARKDOWN_COMMANDS[cmd];
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
            const [_, text, commands] = this._lineCommands();
            // console.log(`[${commands.map(c =>
            //     `${c.type}${JSON.stringify(c.state)}`).join(' > ')}] "${text}"`
            // );
            const diff = this._diffCommands(commands);
            commands.slice(diff).forEach(c => this._state.pushCommand(c));
            const instance = this._state.peekCommand();
            if (instance) {
                this._properties(instance.type).onTextLine
                    ?.call(undefined, this._state, instance.state, text);
            }
        }
        this._diffCommands([]);
    }

    public html() {
        return this._state.html();
    }

    public domNode() {
        const div = document.createElement('div');
        div.innerHTML = this.html();
        div.normalize();
        return div;
    }

    private _diffCommands(commands: MarkdownCommandInstance[]) {
        const oldCommands = [...this._state.peekCommands()];
        let index = 0;
        while (index < Math.min(oldCommands.length, commands.length)) {
            if (oldCommands[index].type !== commands[index].type) {
                break;
            }
            const props = this._properties(commands[index].type);
            if (
                props.isEqualToFirst &&
                !props.isEqualToFirst(commands[index].state, oldCommands.slice(index), commands.slice(index))
            ) {
                break;
            }
            index++;
        }
        for (let i = 0; i < oldCommands.length - index; i++) {
            this._state.popCommand();
        }
        return index;
    }

    private _lineCommands() {
        let remaining = this._input.substring(this._cursor);
        let matched = '';
        const commands: MarkdownCommandInstance[] = [];
        let hasNext = false;
        do {
            hasNext = false;
            for (const _cmd in MARKDOWN_COMMANDS) {
                const cmd = _cmd as MarkdownCommand;
                const props = this._properties(cmd);
                let match: RegExpMatchArray | null;
                if (props.regex && (match = remaining.match(props.regex)) !== null) {
                    matched += match[0];
                    remaining = remaining.substring(match[0].length);
                    commands.push(...(props.onMatch?.call(undefined, this._state, match) ?? [{
                        type: cmd,
                        state: {}
                    }]));
                    hasNext = props.stackable;
                    break;
                }
            }
        } while (hasNext);
        const endLine = remaining.indexOf('\n');
        let text = remaining.substring(0, endLine >= 0 ? endLine : remaining.length);
        this._cursor += matched.length + text.length + 1;
        return [matched, text, commands] as const;
    }

    private _properties(cmd: MarkdownCommand) {
        return MARKDOWN_COMMANDS[cmd];
    }
}
