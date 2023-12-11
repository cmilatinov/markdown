import _ from 'lodash';

enum MarkdownCommand {
    PARAGRAPH = 'p',
    HEADING = 'h',
    CHECKBOX = 'checkbox',
    BLOCKQUOTE = 'blockquote',
    LIST = 'l',
    LIST_ITEM = 'li'
}

interface MarkdownBlock {
    command: MarkdownCommand;
    options?: any;
}

type MarkdownMatchBlocksFn = (match: RegExpMatchArray, stack: MarkdownBlock[]) => MarkdownBlock[];

const MD_ITALIC_N_BOLD_REGEX1 = /\*\*\*([\s\S]+?)\*\*\*/g;
const MD_ITALIC_N_BOLD_REGEX2 = /___([\s\S]+?)___/g;
const MD_BOLD_REGEX1 = /\*\*([\s\S]+?)\*\*/g;
const MD_BOLD_REGEX2 = /__([\s\S]+?)__/g;
const MD_ITALIC_REGEX1 = /\*([\s\S]+?)\*/g;
const MD_ITALIC_REGEX2 = /_([\s\S]+?)_/g;
const MD_LINE_BREAK_REGEX = / {2,}$/;
const MD_LINK_REGEX = /\[(.*)]\((.*?)\)/g;
const MD_LINK_IMAGE_REGEX = /!\[(.*?)]\((.*?)\)/g

const MD_CHECKBOX_REGEX = /^- \[([ x])]/;
const MD_HEADER_REGEX = /^\s*(#{1,6})/;
const MD_BLOCKQUOTE_REGEX = /^\s*>/;
const MD_UNORDERED_LIST_REGEX = /^((:?\s{4})*)\s*-/;
const MD_ORDERED_LIST_REGEX = /^((:?\s{4})*)\s*[0-9]+\./;

const MD_COMMANDS: Array<[MarkdownCommand, RegExp, MarkdownMatchBlocksFn | null]> = [
    [MarkdownCommand.HEADING, MD_HEADER_REGEX, (match) => ([{
        command: MarkdownCommand.HEADING,
        options: { n: match[1].length }
    }])],
    [MarkdownCommand.CHECKBOX, MD_CHECKBOX_REGEX, (match) => ([{
        command: MarkdownCommand.CHECKBOX,
        options: { checked: match[1] === 'x' }
    }])],
    [MarkdownCommand.BLOCKQUOTE, MD_BLOCKQUOTE_REGEX, null],
    [MarkdownCommand.LIST, MD_UNORDERED_LIST_REGEX, (match) => {
        const indent = (match[1]?.length ?? 0) / 4;
        return [...Array(indent + 1)].map(() => [
            { command: MarkdownCommand.LIST, options: { ordered: false } },
            { command: MarkdownCommand.LIST_ITEM, options: { id: _.uniqueId() } }
        ])
            .flat();
    }],
    [MarkdownCommand.LIST, MD_ORDERED_LIST_REGEX, (match) => {
        const indent = (match[1]?.length ?? 0) / 4;
        return [...Array(indent + 1)].map(() => [
            { command: MarkdownCommand.LIST, options: { ordered: true } },
            { command: MarkdownCommand.LIST_ITEM, options: { id: _.uniqueId() } }
        ])
            .flat();
    }]
];

export class MarkdownRenderer {
    private _input: string;
    private _cursor: number;
    private _html: string;
    private _blockStack: MarkdownBlock[];

    constructor(input: string) {
        this._input = input;
        this._cursor = 0;
        this._html = '';
        this._blockStack = [];
    }

    public render() {
        while (this._cursor < this._input.length) {
            const remaining = this._input.substring(this._cursor);
            const cr = remaining.indexOf('\n');
            const end = cr >= 0 ? cr : remaining.length;
            const [blocks, line, text] = this._lineCommands(remaining.substring(0, end));
            const diff = this._diffBlocks(blocks);

            // Close commands on stack
            const nPoppedBlocks = this._blockStack.length - diff;
            for (let i = 0; i < nPoppedBlocks; i++) {
                this._popBlock();
            }
            const added = blocks.slice(diff, blocks.length);
            added.forEach(b => this._pushBlock(b));

            if (
                text === '' &&
                [MarkdownCommand.PARAGRAPH, MarkdownCommand.LIST_ITEM]
                    .includes(_.last(blocks)?.command)
            ) {
                this._popBlock();
            } else {
                this._renderText(text);
            }

            this._cursor += line.length + 1;
        }
        while (this._blockStack.length > 0) {
            this._popBlock();
        }
    }

    public html() {
        return this._html;
    }

    private _diffBlocks(blocks: MarkdownBlock[]) {
        const oldBlocks = [...this._blockStack];
        let index = 0;
        while (index < Math.min(oldBlocks.length, blocks.length)) {
            if (
                oldBlocks[index].command !== blocks[index].command ||
                (index === blocks.length - 1 &&
                    !_.isEqual(oldBlocks[index].options, blocks[index].options))
            ) {
                break;
            }
            index++;
        }
        return index;
    }

    private _lineCommands(line: string): [MarkdownBlock[], string, string] {
        const originalLine = line;
        let blocks: MarkdownBlock[] = [];
        let hasNext = false;
        do {
            hasNext = false;
            for (const [cmd, regex, fn] of MD_COMMANDS) {
                let match: RegExpMatchArray | null;
                if ((match = line.match(regex)) !== null) {
                    line = line.substring(match[0].length ?? 0);
                    const newBlocks = fn ? fn(match, this._blockStack) : [{ command: cmd }];
                    blocks.push(...newBlocks);
                    hasNext = true;
                }
            }
        } while (hasNext);
        if (blocks.length === 0) {
            if (_.last(this._blockStack)?.command == MarkdownCommand.LIST_ITEM) {
                blocks = [...this._blockStack];
            } else {
                blocks.push({
                    command: MarkdownCommand.PARAGRAPH
                });
            }
        }
        if (_.last(blocks)?.command === MarkdownCommand.BLOCKQUOTE) {
            blocks.push({
                command: MarkdownCommand.PARAGRAPH
            });
        }
        return [blocks, originalLine, line];
    }

    private _tagName(block: MarkdownBlock) {
        switch (block.command) {
            case MarkdownCommand.HEADING:
                return `h${block.options?.n}`;
            case MarkdownCommand.CHECKBOX:
                return 'input';
            case MarkdownCommand.LIST:
                return block.options?.ordered ? 'ol' : 'ul';
        }
        return block.command;
    }

    private _tagAttributes(block: MarkdownBlock) {
        switch (block.command) {
            case MarkdownCommand.HEADING:
                return {};
            case MarkdownCommand.LIST_ITEM:
                return {};
            case MarkdownCommand.CHECKBOX:
                return {
                    type: 'checkbox',
                    ...block.options
                };
        }
        return block.options;
    }

    private _pushBlock(block: MarkdownBlock) {
        this._renderOpeningTag(
            this._tagName(block),
            this._tagAttributes(block)
        );
        this._blockStack.push(block);
    }

    private _popBlock() {
        const block = this._blockStack.pop();
        if (block) {
            this._renderClosingTag(this._tagName(block));
        }
    }

    private _renderText(text: string) {
        text = text
            .replace(MD_LINK_IMAGE_REGEX, '<img src="$2" alt="$1">')
            .replace(MD_LINK_REGEX, '<a href="$2">$1</a>')
            .replace(MD_ITALIC_N_BOLD_REGEX1, '<b><i>$1</i></b>')
            .replace(MD_ITALIC_N_BOLD_REGEX2, '<b><i>$1</i></b>')
            .replace(MD_BOLD_REGEX1, '<b>$1</b>')
            .replace(MD_BOLD_REGEX2, '<b>$1</b>')
            .replace(MD_ITALIC_REGEX1, '<i>$1</i>')
            .replace(MD_ITALIC_REGEX2, '<i>$1</i>')
            .replace(MD_LINE_BREAK_REGEX, '<br>')
            .trim();
        this._html += `${text} `;
    }

    private _renderOpeningTag(tag: string, props?: any, selfClosing?: boolean) {
        const attributes = Object.entries(props ?? {})
            .map(([k, v]) => {
                if (v) {
                    return `${k}${v === true ? '' : `="${v}"`}`
                }
                return '';
            })
            .join(' ');
        this._html += `\n<${tag}${attributes ? ` ${attributes}` : ''}${selfClosing ? '/' : ''}>`;
    }

    private _renderClosingTag(tag: string) {
        this._html += `\n</${tag}>`;
    }
}
