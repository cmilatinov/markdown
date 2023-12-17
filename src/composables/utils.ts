export function normalize(el: HTMLElement) {
    traverse(el, n => {
        if (n.nodeType === Node.TEXT_NODE) {
            const node = n as Text;
            node.data = node.data.trim();
        }
    });
    el.normalize();
}

export function traverse(node: Node, fn: (node: Node) => void) {
    fn(node);
    for (const child of node.childNodes) {
        traverse(child, fn);
    }
}


export function compare(node1: Node, node2: Node): boolean {
    if (node1.nodeType !== node2.nodeType) {
        return false;
    }
    if (node1 instanceof Text && node2 instanceof Text) {
        const d1 = node1.data.trim();
        const d2 = node2.data.trim();
        if (d1 !== d2) {
            console.log(`'${d1}' !== '${d2}'`);
            return false;
        }
    }
    if (
        node1 instanceof HTMLElement &&
        node2 instanceof HTMLElement &&
        node1.tagName !== node2.tagName
    ) {
        console.log(`${node1.tagName} !== ${node2.tagName}`);
        return false;
    }
    const list1 = [...node1.childNodes];
    const list2 = [...node2.childNodes];
    if (list1.length !== list2.length) {
        return false;
    }
    return list1.every((n, i) => compare(n, list2[i]));
}

export function escapeHTML(content: string) {
    const text = document.createTextNode(content);
    const p = document.createElement('p');
    p.appendChild(text);
    return p.innerHTML;
}

export function replaceInString(str: string, index: number, length: number, replacement: string) {
    return str.substring(0, index) + replacement + str.substring(index + length);
}
