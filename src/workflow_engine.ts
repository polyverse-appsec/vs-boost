/*

the basic idea is the engine will take an array of promise generators, and run through them one at a time in serial until 
every promise is successfully resolved.  if a promise fails, then the promise generator is re-run and a new promise is put on the queue.  

the special behavior is that the main array of promises is to be run in groups, as specified by a pattern array.  
thus, if the pattern array is [1, 2, 4, 8], then the first promise is run, followed by *all* of the afterEachGroup promises, 
then two promises from the main array are run, followed by *all* of the afterEachGroup promises, then four promises are run and so forth.\

Initialization: The engine will be initialized with the following arrays of promise generators:
    before: Run at the very beginning of the workflow.
    main: The main group of promise generators.
    afterEachGroup: Run after every group, as specified by the pattern.
    after: Run at the end of the workflow.
    pattern: Specifies the grouping for the main array.

Running the Workflow:
First, the before promises will be run.
Then, the main promises will be run in groups specified by the pattern. After each group, all afterEachGroup promises are run.
If any promise in the main array fails, its generator is re-run, and a new promise is added to the queue.
Finally, the after promises will be run.
Abort: If the abort API is called, the workflow will stop executing further promises.
*/

import { group } from "console";

export type PromiseGenerator = () => () => Promise<any>;
export type PromiseGeneratorWithInputs = () => (inputs: any[]) => Promise<any>;
export type BeforePromiseGenerator = PromiseGenerator;
export type AfterEachPromiseGenerator = PromiseGeneratorWithInputs;
export type AfterEachGroupPromiseGenerator = PromiseGeneratorWithInputs;
export type AfterPromiseGenerator = PromiseGeneratorWithInputs;

export interface WorkflowEngineOptions {
    before?: BeforePromiseGenerator[];
    afterEach?: AfterEachPromiseGenerator[];
    afterEachGroup?: AfterEachGroupPromiseGenerator[];
    after?: AfterPromiseGenerator[];
    pattern?: number[];
}

export class WorkflowEngine {
    private before: BeforePromiseGenerator[];
    private main: PromiseGenerator[];
    private afterEach: AfterEachPromiseGenerator[];
    private afterEachGroup: AfterEachGroupPromiseGenerator[];
    private after: AfterPromiseGenerator[];
    private pattern: number[];
    private aborted: boolean = false;

    constructor(
        main: PromiseGenerator[],
        options: WorkflowEngineOptions = {}
    ) {
        this.before = options.before || [];
        this.main = [...main];
        this.afterEach = options.afterEach || [];
        this.afterEachGroup = options.afterEachGroup || [];
        this.after = options.after || [];
        this.pattern = options.pattern || [1, 2, 4, 8, 16];
    }

    public async run() {
        this.aborted = false;
        await this.executePromises(this.before);
        let allResults: any[] = [];

        let groupIndex = 0;
        while (this.main.length > 0 && !this.aborted) {
            const groupSize = this.pattern[groupIndex] || this.pattern[this.pattern.length - 1]; // Use the last group size if we've exceeded the pattern
        
            let groupResults: any[] = [];
            for (let i = 0; i < groupSize && this.main.length > 0; i++) {
                
                if (this.aborted) {
                    return;
                }
                const promiseGenerator = this.main.shift()!;
                const promise = promiseGenerator();
                try {
                    let result = await promise();
                    groupResults.push(result);
                    await this.executePromisesWithInputs(this.afterEach, [result]);
                } catch (error) {
                    this.main.push(promiseGenerator); // Retry later
                }
            }
        
            await this.executePromisesWithInputs(this.afterEachGroup, groupResults);
        
            // Move to the next group size if available
            if (groupIndex < this.pattern.length - 1) {
                groupIndex++;
            }
            allResults.push(groupResults);
        }

        await this.executePromisesWithInputs(this.after, allResults);
    }

    public abort() {
        this.aborted = true;
    }

    private async executePromises(promiseGenerators: PromiseGenerator[]) {
        for (let generatorFactory of promiseGenerators) {
            if (this.aborted){
                return;
            }
            const generator = generatorFactory();
            await generator();
        }
    }

    private async executePromisesWithInputs(promiseGenerators: PromiseGeneratorWithInputs[], inputs: any[]) {
        for (let generatorFactory of promiseGenerators) {
            if (this.aborted){
                return;
            }
            const generator = generatorFactory();
            await generator(inputs);
        }
    }
    
}

