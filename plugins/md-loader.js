import fs from 'node:fs';
import { compileTemplate } from '@vue/compiler-sfc';
import MarkdownIt from 'markdown-it';

// md-loader: add to vite plugins + assetsInclude for *.md (see repo docs)

export function mdLoader() {
    const mdRegex = /\.md$/;
    return {
        name: 'markdown-loader',
        enforce: 'pre',

        async load(id) {
            if (!id.match(mdRegex)) {
                return;
            }
            const [path] = id.split('?', 2);

            let data;
            try {
                data = fs.readFileSync(path, 'utf-8');
            } catch (ex) {
                console.warn(
                    ex,
                    '\n',
                    `${id} couldn't be loaded by vite-md-loader, fallback to default loader`,
                );
                return;
            }

            try {
                const md = new MarkdownIt();
                const result = md.render(data);
                const { code } = compileTemplate({
                    id: JSON.stringify(id),
                    source: `${result}`,
                    filename: path,
                    transformAssetUrls: false,
                });
                return `${code}\nexport default { render: render }`;
            } catch (ex) {
                console.warn(ex, '\n', `${id} compile markdown fail`);
                return;
            }
        },
    };
}

export default mdLoader;
