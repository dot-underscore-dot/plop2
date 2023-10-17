import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';
import { joinImages } from 'join-images'
import config from './config.json'  assert { type: 'json' };
const totalStart = process.hrtime();
const elementTypes = [];
const dataStructs = new Map();

//rm -rf ./build/*
//prepare build folder
console.log('--preparing build folder--');
{
    if (!existsSync('./build'))
        mkdirSync('./build');
    else if (process.argv[2] === '--clean')
        rmSync('./build', { recursive: true });  //clean build file to remove residual js files and such 
}

// @node preprocess.js
//elementdata.h generation
console.log('--generating elementdata.h--');
{
    const files = readdirSync('./src/c/elements');
    const elementsDir = files.reduce(
        (acc, cur) => acc ?? (statSync(`./src/c/elements/${cur}`).isDirectory() ? cur : null),
        null
    );
    const elements = readdirSync(`./src/c/elements/${elementsDir}`);

    for (const element of elements) {
        const name = element.substring(0, element.length - 2);
        elementTypes.push(name);

        const contents = readFileSync(`./src/c/elements/${elementsDir}/${element}`, { encoding: 'utf-8' });
        const ind = contents.search(`struct data {`);
        if (ind != -1) {
            let braceCount = 1;
            let struct = `struct data {`;
            let i = ind + struct.length;
            while (braceCount) {
                let char = contents.charAt(i++);
                struct += char;
                if (char == '{') braceCount += 1;
                else if (char == '}') braceCount -= 1;
            }
            dataStructs.set(name, struct);
        }
    }

    const out = `// DONT EDIT THIS CODE DIRECTLY!

#ifndef ELEMENTDATA_H
#define ELEMENTDATA_H

#include "../main.h"

#define FOREACH_ELEMENTTYPE(M)\\
${elementTypes.map(type => `    M(${type.toUpperCase()},${type.toLowerCase()})`).join('\\\n')}

typedef enum ElementType {
    TYPE_EMPTY,
    #define GENERATE_ENUM(ENUM,_) TYPE_##ENUM,
    FOREACH_ELEMENTTYPE(GENERATE_ENUM)
    #undef GENERATE_ENUM
    type_length
} __attribute__((__packed__)) ElementType;

#define FOREACH_ELEMENTTYPE_WITH_STRUCT_DATA(M)\\
${Array.from(dataStructs).map(([type]) => `    M(${type.toUpperCase()},${type.toLowerCase()})`).join('\\\n')}

${Array.from(dataStructs).map(([type, struct]) => {
        return `${struct.replace(`struct data {`, `struct ${type}_data {`)};`
    }).join('\n')}

#endif
`;

    writeFileSync('./src/c/elements/elementdata.h', out, { encoding: 'utf-8' });
}

//atlas.png generation
console.log('--generating atlas.png--');
{
    const atlas = elementTypes.map(t => {
        const path = `./src/textures/${t}.png`;
        if (existsSync(path)) return path;
        else return './src/textures/missing.png'
    });
    while (Math.log2(atlas.length) % 1 != 0) atlas.push('./src/textures/missing.png');

    joinImages(atlas).then(img => img.toFile('./build/atlas.png'));
}

//cp -r ./src/static/* ./build
//copy static files
console.log('--copying static files--');
cpSync('./src/static', './build', { recursive: true });

//elements.glsl generation
console.log('--generating elements.glsl--');
{
    const shader = readFileSync('./src/static/shaders/elements.glsl');
    const out = `#version 300 es
#define ATLAS_HEIGHT (${2 ** Math.ceil(Math.log2(elementTypes.length * 8))}.0)
${elementTypes.map((name, type) => `#define ${name.toUpperCase()} (${type}u)`).join('\n')}
${shader}`;
    writeFileSync('./build/shaders/elements.glsl', out, { encoding: 'utf-8' });
}
//set config macros
console.log('--setting config macros--');
writeFileSync('./src/c/config.h',
`#define DEBUG ${config.debug ? 1 : 0}
#define USE_GPU ${config.gpu ? 1 : 0}

`, { encoding: 'utf-8' });

//compile wasm
console.log('--compiling wasm--');
const clangStart = process.hrtime();
{
    const files = readdirSync('./src/c', { recursive: true })
        .filter(file => file.endsWith('.S') || file.endsWith('.c'))
        .map(file => `'./src/c/${file}'`);

    execSync(`clang \
        -Wall -Wextra -Wpedantic \
        -Wno-unused-parameter -Wno-strict-prototypes \
        --target=wasm32 -nostdlib -fno-builtin \
        -matomics -mbulk-memory${config.debug ? '' : ' -msimd128 -mrelaxed-simd'}\
        ${config.debug ? '-gdwarf ' : '-O3 '}-ffast-math -flto=thin \
        ${config.debug ? '' : '-Wl,--lto-O3 '}-Wl,--thinlto-cache-dir=cache -Wl,--error-limit=0 \
        -Wl,--no-entry -Wl,--export-dynamic \
        -Wl,--import-memory -Wl,--shared-memory -Wl,--initial-memory=${config.memory} -Wl,--max-memory=${config.memory} \
        -Wl,-z,stack-size=65536 \
        -o build/game.wasm \
        ${files.join(' ')}`, { stdio: "inherit" });
}
const clangDuration = process.hrtime(clangStart);

//run tsc
console.log('--running tsc--');
const typescriptStart = process.hrtime();
execSync('npx tsc', { stdio: "inherit" });
const typescriptDuration = process.hrtime(typescriptStart);
const totalDuration = process.hrtime(totalStart);
console.log(`----build finished----
--timings--
clang:${(clangDuration[0] * 1000) + (clangDuration[1] / 1000000)}ms
typescript:${(typescriptDuration[0] * 1000) + (typescriptDuration[1] / 1000000)}ms
total:${(totalDuration[0] * 1000) + (totalDuration[1] / 1000000)}ms
--timings--`)