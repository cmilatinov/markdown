import _ from 'lodash';

enum MarkdownCommand {
    PARAGRAPH = 'p',
    HEADING = 'h',
    CHECKBOX_LABEL = 'label',
    BLOCKQUOTE = 'blockquote',
    LIST = 'l',
    LIST_ITEM = 'li',
    TABLE = 'table',
    CODE_BLOCK = 'code',
    HORIZONTAL_RULE = 'hr'
}

interface MarkdownBlock {
    command: MarkdownCommand;
    options?: any;
}

type MarkdownMatchBlocksFn = (renderer: MarkdownRenderer, match: RegExpMatchArray, stack: MarkdownBlock[]) => MarkdownBlock[];

const MD_ITALIC_REGEX = /\*(.*?)\*/g;
const MD_SUBSCRIPT_REGEX = /_(.*?)_/g;
const MD_SUPERSCRIPT_REGEX = /\^(.*?)\^/g;
const MD_CODE_REGEX = /`(.*?)`/g;
const MD_BOLD_REGEX = /\*\*(.*?)\*\*/g;
const MD_UNDERLINE_REGEX = /__(.*?)__/g;
const MD_HIGHLIGHT_REGEX = /==(.*?)==/g;
const MD_STRIKETHROUGH_REGEX = /~~(.*?)~~/g;

const MD_LINE_BREAK_REGEX = / {2,}$/;
const MD_LINK_REGEX = /\[(.*)]\((.*?)\)/g;
const MD_LINK_IMAGE_REGEX = /!\[(.*?)]\((.*?)\)/g;

const MD_ESCAPED_CHAR = /\\([\\`*_{}[\]<>()#+-.!|])/g;

const MD_TABLE_REGEX = /^\s*\|/;
const MD_CHECKBOX_REGEX = /^\s*- \[([ x])]/;
const MD_HEADER_REGEX = /^\s*(#{1,6})/;
const MD_BLOCKQUOTE_REGEX = /^\s*>/;
const MD_UNORDERED_LIST_REGEX = /^((:?\s{4})*)\s*-/;
const MD_ORDERED_LIST_REGEX = /^((:?\s{4})*)\s*[0-9]+\./;
const MD_CODE_BLOCK_REGEX = /^\s*```/;
const MD_HORIZONTAL_RULE_REGEX = /^\s*-{3,}/;

const MD_TABLE_CELL_REGEX = /^\s*([^|]*)\s*\|/;
const MD_TABLE_SEPARATOR_REGEX = /^\s*(-+)\s*\|/;

const MD_COMMANDS: Array<[MarkdownCommand, RegExp, boolean, MarkdownMatchBlocksFn | null]> = [
    [MarkdownCommand.HEADING, MD_HEADER_REGEX, false, (_, match) => ([{
        command: MarkdownCommand.HEADING,
        options: { n: match[1].length }
    }])],
    [MarkdownCommand.HORIZONTAL_RULE, MD_HORIZONTAL_RULE_REGEX, false, null],
    [MarkdownCommand.CHECKBOX_LABEL, MD_CHECKBOX_REGEX, false, (r, match) => ([{
        command: MarkdownCommand.CHECKBOX_LABEL,
        options: { id: r.nextId(), checked: match[1] === 'x' }
    }])],
    [MarkdownCommand.TABLE, MD_TABLE_REGEX, false, null],
    [MarkdownCommand.CODE_BLOCK, MD_CODE_BLOCK_REGEX, false, (_, match) => ([{
        command: MarkdownCommand.CODE_BLOCK,
        options: { code: match[1] }
    }])],
    [MarkdownCommand.BLOCKQUOTE, MD_BLOCKQUOTE_REGEX, true, null],
    [MarkdownCommand.LIST, MD_UNORDERED_LIST_REGEX, false, (r, match) => {
        const indent = (match[1]?.length ?? 0) / 4;
        return [...Array(indent + 1)].map(() => [
            { command: MarkdownCommand.LIST, options: { ordered: false } },
            { command: MarkdownCommand.LIST_ITEM, options: { id: r.nextId() } }
        ])
            .flat();
    }],
    [MarkdownCommand.LIST, MD_ORDERED_LIST_REGEX, false, (r, match) => {
        const indent = (match[1]?.length ?? 0) / 4;
        return [...Array(indent + 1)].map(() => [
            { command: MarkdownCommand.LIST, options: { ordered: true } },
            { command: MarkdownCommand.LIST_ITEM, options: { id: r.nextId() } }
        ])
            .flat();
    }]
];

export class MarkdownRenderer {
    private _id: number;
    private _input: string;
    private _cursor: number;
    private _html: string;
    private readonly _blockStack: MarkdownBlock[];
    private _tableRows: string[];

    constructor(input: string) {
        this._id = 1;
        this._input = input;
        this._cursor = 0;
        this._html = '';
        this._blockStack = [];
        this._tableRows = [];
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

            const command = _.last(blocks)?.command;
            if (
                text === '' &&
                ([MarkdownCommand.PARAGRAPH, MarkdownCommand.LIST_ITEM] as (MarkdownCommand | undefined)[])
                    .includes(command)
            ) {
                this._popBlock();
            } else if (command === MarkdownCommand.TABLE) {
                this._tableRows.push(`|${text}`);
            } else if (command !== MarkdownCommand.HORIZONTAL_RULE) {
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

    public domNode() {
        const div = document.createElement('div');
        div.innerHTML = this.html();
        div.normalize();
        return div;
    }

    public nextId() {
        return this._id++;
    }

    private _diffBlocks(blocks: MarkdownBlock[]) {
        const oldBlocks = [...this._blockStack];
        let index = 0;
        while (index < Math.min(oldBlocks.length, blocks.length)) {
            if (
                oldBlocks[index].command !== blocks[index].command ||
                [MarkdownCommand.HEADING,  MarkdownCommand.HORIZONTAL_RULE].includes(blocks[index].command) ||
                (blocks[index].command === MarkdownCommand.LIST_ITEM &&
                    blocks.map(b => b.command).lastIndexOf(MarkdownCommand.LIST_ITEM) === index &&
                    !_.isEqual(oldBlocks[index].options, blocks[index].options)) ||
                (blocks[index].command === MarkdownCommand.CHECKBOX_LABEL &&
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
            for (const [cmd, regex, multiple, fn] of MD_COMMANDS) {
                let match: RegExpMatchArray | null;
                if ((match = line.match(regex)) !== null) {
                    line = line.substring(match[0].length ?? 0);
                    const newBlocks = fn ? fn(this, match, this._blockStack) : [{ command: cmd }];
                    blocks.push(...newBlocks);
                    hasNext = multiple;
                    break;
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
            case MarkdownCommand.CHECKBOX_LABEL:
                return {
                    for: `input_checkbox_${block.options.id}`
                };
            case MarkdownCommand.LIST:
                return {};
        }
        return block.options;
    }

    private _pushBlock(block: MarkdownBlock) {
        switch (block.command) {
            case MarkdownCommand.CHECKBOX_LABEL:
                this._renderOpeningTag(
                    'input',
                    {
                        type: 'checkbox',
                        ...block.options,
                        id: `input_checkbox_${block.options.id}`
                    },
                    true
                );
                break;
            case MarkdownCommand.CODE_BLOCK:
                this._renderOpeningTag('pre');
                break;
        }
        if (block.command !== MarkdownCommand.TABLE && block.command !== MarkdownCommand.HORIZONTAL_RULE) {
            this._renderOpeningTag(
                this._tagName(block),
                this._tagAttributes(block)
            );
        }
        this._blockStack.push(block);
    }

    private _popBlock() {
        const block = this._blockStack.pop();
        if (block) {
            if (block.command !== MarkdownCommand.TABLE) {
                this._renderClosingTag(this._tagName(block));
            }
            switch (block.command) {
                case MarkdownCommand.CHECKBOX_LABEL:
                    this._html += '<br>';
                    return;
                case MarkdownCommand.TABLE:
                    if (!this._renderTable()) {
                        this._renderOpeningTag('p');
                        this._tableRows.forEach(r => this._renderText(`${r}<br>`));
                        this._renderClosingTag('p');
                    }
                    this._tableRows = [];
                    return;
                case MarkdownCommand.CODE_BLOCK:
                    this._renderClosingTag('pre');
                    return;
                case MarkdownCommand.HORIZONTAL_RULE:
                    this._renderOpeningTag('hr', undefined, true);
                    return;
            }
        }
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

    private _renderTable() {
        const rows = this._tableRows;
        if (rows.length < 2) {
            return false;
        }

        const headers = this._parseTableCells(rows[0], MD_TABLE_CELL_REGEX);
        const separators = this._parseTableCells(rows[1], MD_TABLE_SEPARATOR_REGEX);
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

        this._renderOpeningTag('table');
        this._renderOpeningTag('thead');
        this._renderOpeningTag('tr');
        headers.forEach((h) => {
            this._renderOpeningTag('th');
            this._renderText(h.trim());
            this._renderClosingTag('th');
        });
        this._renderClosingTag('tr');
        this._renderClosingTag('thead');
        this._renderOpeningTag('tbody');
        table.forEach((r) => {
            this._renderOpeningTag('tr');
            r.forEach((c) => {
                this._renderOpeningTag('td');
                this._renderText(c);
                this._renderClosingTag('td');
            });
            this._renderClosingTag('tr');
        });
        this._renderClosingTag('tbody');
        this._renderClosingTag('table');

        return true;
    }

    private _renderText(text: string) {
        const isCode = _.last(this._blockStack)?.command === MarkdownCommand.CODE_BLOCK;
        text = text
            .replace(MD_LINK_IMAGE_REGEX, '<img src="$2" alt="$1">')
            .replace(MD_LINK_REGEX, '<a href="$2">$1</a>')
            .replace(MD_BOLD_REGEX, '<b>$1</b>')
            .replace(MD_UNDERLINE_REGEX, '<ins>$1</ins>')
            .replace(MD_HIGHLIGHT_REGEX, '<mark>$1</mark>')
            .replace(MD_STRIKETHROUGH_REGEX, '<del>$1</del>')
            .replace(MD_ITALIC_REGEX, '<i>$1</i>')
            .replace(MD_SUBSCRIPT_REGEX, '<sub>$1</sub>')
            .replace(MD_SUPERSCRIPT_REGEX, '<sup>$1</sup>')
            .replace(MD_CODE_REGEX, '<code>$1</code>')
            .replace(MD_LINE_BREAK_REGEX, '<br>')
            .replace(MD_ESCAPED_CHAR, '$1');
        if (!isCode) {
            text = text.trim();
        }
        this._html += `${text}${isCode ? '\n' : ' '}`;
    }

    private _renderOpeningTag(tag: string, props?: any, selfClosing?: boolean) {
        const attributes = Object.entries(props ?? {})
            .map(([k, v]) => {
                if (!_.isNil(v) && v !== false) {
                    return `${k}${v === true ? '' : `="${v}"`}`;
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
