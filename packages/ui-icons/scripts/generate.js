const { fas } = require('@fortawesome/free-solid-svg-icons');
const fs = require('fs');
const p = require('path');
const config = require('./config');

const camelToKebabCase = (str) => {
    return str
        .split('')
        .map((letter, idx) => {
            return letter.toUpperCase() === letter ? `${idx !== 0 ? '-' : ''}${letter.toLowerCase()}` : letter;
        })
        .join('');
};

const generateFile = (name, componentName, iconPack = 'solid') =>
    `import { ${name} } from '@fortawesome/free-${iconPack}-svg-icons';

import { IconProps, StyledFAIcon } from './icon-utils';

/**
 * ${componentName} icon from FontAwesome
 *
 * @param {IconProps} props - the component props
 */
const ${componentName} = (props: IconProps): JSX.Element => {
    return <StyledFAIcon icon={${name}} {...props} />;
};

export default ${componentName};
`;

const getComponentName = (name) => {
    if (config.renamed[name]) {
        return config.renamed[name];
    }

    if (name.length <= 3 ){
        return name.replace('fa', 'char')
    }

    let componentName = name.replace('fa', '');
    if (componentName === 'Infinity') {
        componentName = 'InfinitySign';
    }
    return componentName;
};

const getExportLine = (componentName, fileName) => `export { default as ${componentName} } from './${fileName}';`;

const generate = () => {
    const targetDir = './src';
    const index = 'index.tsx';
    const indexPath = p.join(targetDir, index);

    const indexBuffer = fs.readFileSync(indexPath);
    const indexContent = indexBuffer.toString();

    const exports = [];

    // solid icons
    Object.keys(fas).forEach((name) => {
        if (config.farIcons.includes(name) || config.excluded.includes(name)) {
            return;
        }


        const componentName = getComponentName(name);
        const fileName = camelToKebabCase(componentName).toLowerCase();
        const filePath = p.join(targetDir, fileName + '.tsx');

        const exportLine = getExportLine(componentName, fileName);

        const file = generateFile(name, componentName, 'solid');

        fs.writeFileSync(filePath, file, { encoding: 'utf-8' });


        if (!indexContent.includes(exportLine)) {
            exports.push(exportLine);
        }
    });


    // regular icons
    config.farIcons.forEach((name) => {
        if (config.excluded.includes(name)) {
            return;
        }

        const componentName = getComponentName(name);
        const fileName = camelToKebabCase(componentName).toLowerCase();
        const filePath = p.join(targetDir, fileName + '.tsx');

        const exportLine = getExportLine(componentName, fileName);

        const file = generateFile(name, componentName, 'regular');

        fs.writeFileSync(filePath, file);

        if (!indexContent.includes(exportLine)) {
            exports.push(exportLine);
        }
    });

    if (exports.length > 0) {
        newIndexContent = indexContent + exports.join('\n') + '\n';
    }

    fs.writeFileSync(indexPath, newIndexContent);
};

generate();
