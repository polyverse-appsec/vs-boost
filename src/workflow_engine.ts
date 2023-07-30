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

export type PromiseGenerator = () => () => Promise<any>;
export type BeforePromiseGenerator = PromiseGenerator;
export type AfterEachPromiseGenerator = PromiseGenerator;
export type AfterEachGroupPromiseGenerator = PromiseGenerator;
export type AfterPromiseGenerator = PromiseGenerator;

export class WorkflowEngine {
    private before: BeforePromiseGenerator[];
    private main: PromiseGenerator[];
    private afterEach: AfterEachPromiseGenerator[];
    private afterEachGroup: AfterEachGroupPromiseGenerator[];
    private after: AfterPromiseGenerator[];
    private pattern: number[];
    private aborted: boolean = false;

    constructor(
        before: BeforePromiseGenerator[] | undefined = undefined,
        main: PromiseGenerator[],
        afterEach: AfterEachPromiseGenerator[] | undefined = undefined,
        afterEachGroup: AfterEachGroupPromiseGenerator[] | undefined = undefined,
        after: AfterPromiseGenerator[] | undefined = undefined,
        pattern: number[] | undefined = undefined
    ) {
        this.before = before? before : [];
        this.main = [...main];
        this.afterEach = afterEach? afterEach : [];
        this.afterEachGroup = afterEachGroup? afterEachGroup : [];
        this.after = after? after : [];
        this.pattern = pattern ? pattern : [1, 2, 4, 8, 16];
    }

    public async run() {
        this.aborted = false;
        await this.executePromises(this.before);

        let groupIndex = 0;
        while (this.main.length > 0 && !this.aborted) {
            const groupSize = this.pattern[groupIndex] || this.pattern[this.pattern.length - 1]; // Use the last group size if we've exceeded the pattern
        
            for (let i = 0; i < groupSize && this.main.length > 0; i++) {
                if (this.aborted) {
                    return;
                }
                const promiseGenerator = this.main.shift()!;
                const promise = promiseGenerator();
                try {
                    await promise();
                    await this.executePromises(this.afterEach);
                } catch (error) {
                    this.main.push(promiseGenerator); // Retry later
                }
            }
        
            await this.executePromises(this.afterEachGroup);
        
            // Move to the next group size if available
            if (groupIndex < this.pattern.length - 1) {
                groupIndex++;
            }
        }

        await this.executePromises(this.after);
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
    
}

