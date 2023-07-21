// splitCode.test.ts
import { splitCode, splitCodeWithAggregation } from '../../split';
import { expect } from 'chai';
import path from 'path';
import fs from 'fs';

describe('splitCode Unit', () => {

    const dataFolder = __dirname + "/data/";

    it('should work in normal case', () => {
        const code = fs.readFileSync(path.join(dataFolder, 'normalFunctions.ts'), 'utf8');
        const firstFunction = fs.readFileSync(path.join(dataFolder, 'normalFunctions.first.ts'), 'utf8');
        const secondFunction = fs.readFileSync(path.join(dataFolder, 'normalFunctions.second.ts'), 'utf8');

        const expectedOutput: [string[], number[]] = [
            [
                firstFunction,
                secondFunction
            ],
            [1, 5]
        ];

        const result = splitCode(code);
        result[0].forEach((str, i) => {
            const expected = expectedOutput[0][i];
            const actual = str;
            expect(actual).to.equal(expected);
        });
        result[1].forEach((num, i) => {
            expect(num).to.equal(expectedOutput[1][i]);
        });
        
        expect(result).to.deep.equal(expectedOutput);
    });

    it('aggregator work in normal case', () => {
        const code = fs.readFileSync(path.join(dataFolder, 'normalFunctions.ts'), 'utf8');

        const expectedOutput: [string[], number[]] = [
            [
                code,
            ],
            [1]
        ];

        const result = splitCodeWithAggregation(splitCode, code);
        result[0].forEach((str, i) => {
            expect(str.trimEnd()).to.equal(expectedOutput[0][i].trimEnd());
        });
        result[1].forEach((num, i) => {
            expect(num).to.equal(expectedOutput[1][i]);
        });
        
        expect(result).to.deep.equal(expectedOutput);
    });

    it('should handle unclosed function', () => {
        const code = fs.readFileSync(path.join(dataFolder, 'danglingBracketFunctions.ts'), 'utf8');

        const expectedOutput: [string[], number[]] = [
            [
                code.trimEnd(),
            ],
            [1]
        ];

        const result = splitCode(code);
        result[0].forEach((str, i) => {
            const expected = expectedOutput[0][i];
            const actual = str;
            expect(actual).to.equal(expected);
        });
        result[1].forEach((num, i) => {
            expect(num).to.equal(expectedOutput[1][i]);
        });
        
        expect(result).to.deep.equal(expectedOutput);
    });

    it('should handle extra closing brace', () => {
        const code = `
        function testFunc() {
            console.log("Hello, World!");
        }}
        
        function testFunc2() {
            console.log("Goodbye, World!");
        }
        `;

        const expectedOutput: [string[], number[]] = [
            [
                "\nfunction testFunc() {\n    console.log(\"Hello, World!\");\n}\n",
                "\nfunction testFunc2() {\n    console.log(\"Goodbye, World!\");\n}\n"
            ],
            [1, 5]
        ];

        expect(splitCode(code)).to.deep.equal(expectedOutput);
    });
});
