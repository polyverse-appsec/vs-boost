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

import { v4 as uuidv4 } from "uuid";

// Custom error class for handling typed errors
export class WorkflowError extends Error {
    constructor(public type: "retry" | "skip" | "abort", message?: string) {
        super(message);
    }
}

export type PromiseGenerator = () => () => Promise<any>;
export type PromiseGeneratorWithInputs = () => (inputs: any[]) => Promise<any>;
export type BeforeRunPromiseGenerator = PromiseGenerator;
export type AfterEachTaskPromiseGenerator = PromiseGeneratorWithInputs;
export type AfterEachTaskGroupPromiseGenerator = PromiseGeneratorWithInputs;
export type AfterRunPromiseGenerator = PromiseGeneratorWithInputs;

export interface WorkflowEngineOptions {
    beforeRun?: BeforeRunPromiseGenerator[];
    afterEachTask?: AfterEachTaskPromiseGenerator[];
    afterEachTaskGroup?: AfterEachTaskGroupPromiseGenerator[];
    afterRun?: AfterRunPromiseGenerator[];
    pattern?: number[];
    logger?: any;
    maxRetries?: number;
}

function getElapsedTime(startTime: number): string {
    const elapsedMilliseconds = Date.now() - startTime;
    const elapsedSeconds = elapsedMilliseconds / 1000;

    if (elapsedSeconds < 110) {
        return `${elapsedSeconds.toFixed(2)} secs`;
    } else {
        const elapsedMinutes = elapsedSeconds / 60;
        return `${elapsedMinutes.toFixed(2)} mins`;
    }
}

function getFormattedDate(): string {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0'); // months are 0-based in JS
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');

    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

export class WorkflowEngine {
    private beforeRun: BeforeRunPromiseGenerator[];
    private tasks: PromiseGenerator[];
    private afterEachTask: AfterEachTaskPromiseGenerator[];
    private afterEachTaskGroup: AfterEachTaskGroupPromiseGenerator[];
    private afterRun: AfterRunPromiseGenerator[];
    private pattern: number[];
    private aborted: boolean = false;
    private logger: any;
    private maxRetries: number;
    private retryCounts: Map<PromiseGenerator, number> = new Map(); // To keep track of retries for each promise generator
    private id: string = uuidv4();

    constructor(tasks: PromiseGenerator[], options: WorkflowEngineOptions = {}) {
        this.beforeRun = options.beforeRun || [];
        this.tasks = [...tasks];
        this.afterEachTask = options.afterEachTask || [];
        this.afterEachTaskGroup = options.afterEachTaskGroup || [];
        this.afterRun = options.afterRun || [];
        this.pattern = options.pattern || [1, 2, 4, 8, 16];
        //default to a no-op function for logger if none is provided
        this.logger = options.logger || undefined;
        this.maxRetries = options.maxRetries || 5;

        this.logger?.debug(`${getFormattedDate()}:Workflow(${this.id}):created`);
    }

    public async run() {
        this.aborted = false;
        const overallStartTime = Date.now();
        let startTime = Date.now();

        this.logger?.debug(`${getFormattedDate()}:Workflow(${this.id}):Run starting`);

        try {
            this.logger?.log(`${getFormattedDate()}:Workflow(${this.id}):beforeRun:starting`);

            await this.executePromises(this.beforeRun);

            this.logger?.log(`${getFormattedDate()}:Workflow(${this.id}):beforeRun:finished:success:${getElapsedTime(startTime)}`);

        } catch (error) {

            this.logger?.error(`${getFormattedDate()}:Workflow(${this.id}):beforeRun:finished:error:${getElapsedTime(startTime)}:${error}`);
            return;
        }
        let allResults: any[] = [];

        let groupIndex = 0;
        while (this.tasks.length > 0 && !this.aborted) {
            const groupSize =
                this.pattern[groupIndex] ||
                this.pattern[this.pattern.length - 1]; // Use the last group size if we've exceeded the pattern

            let groupResults: any[] = [];
            for (let i = 0; i < groupSize && this.tasks.length > 0; i++) {
                if (this.aborted) {
                    return allResults;
                }
                const promiseGenerator = this.tasks.shift()!;
                const promise = promiseGenerator();
                try {
                    this.logger?.log(`${getFormattedDate()}:Workflow(${this.id}):task-${promise.name}:starting`);

                    let result = await promise();

                    this.logger?.log(`${getFormattedDate()}:Workflow(${this.id}):task-${promise.name}:finished:success:${getElapsedTime(startTime)}`);

                    groupResults.push(result);

                    startTime = Date.now();
                    try {
                        this.logger?.log(`${getFormattedDate()}:Workflow(${this.id}):afterEachTask:starting`);
            
                        await this.executePromisesWithInputs(this.afterEachTask, [
                            result,
                        ]);

                        if (this.retryCounts.has(promiseGenerator)) {
                            this.logger?.log(
                                `${getFormattedDate()}:Workflow(${this.id}):afterEachTask:finished:success:afterRetries=${this.retryCounts.get(promiseGenerator)}:${getElapsedTime(startTime)}`);

                            this.retryCounts.delete(promiseGenerator);
                        } else {
                            this.logger?.log(`${getFormattedDate()}:Workflow(${this.id}):afterEachTask:finished:success:${getElapsedTime(startTime)}`);
                        }
                        
                    } catch (error) {
                        this.logger?.error(`${getFormattedDate()}:Workflow(${this.id}):afterEachTask:finished:error:${getElapsedTime(startTime)}:${error}`);
                    }

                } catch (error) {
                    // default to retry with generic error
                    let errorType = "retry";

                    // otherwise use the workflow specific requested retry logic
                    if (error instanceof WorkflowError) {
                        errorType = error.type;
                    }
                    
                    switch (errorType) {
                        case "retry":
                            const currentRetries =
                                this.retryCounts.get(promiseGenerator) || 0;
                            if (currentRetries < this.maxRetries + 1) {
                                this.retryCounts.set(
                                    promiseGenerator,
                                    currentRetries + 1
                                );
                                this.tasks.push(promiseGenerator);
                            } else {
                                this.logger?.error(
                                    `${getFormattedDate()}:Workflow(${this.id}):task-${promise.name}:Max retries reached; Skipping.`
                                );
                                this.retryCounts.delete(promiseGenerator);
                            }
                            break;
                        case "skip":
                            this.logger?.error(
                                `${getFormattedDate()}:Workflow(${this.id}):task-${promise.name}:Skipping due to error: ${(error as Error).message}`
                            );
                            this.retryCounts.delete(promiseGenerator);
                            // Just skip and continue
                            break;
                        case "abort":
                            this.logger?.error(
                                `${getFormattedDate()}:Workflow(${this.id}):task-${promise.name}:Aborting workflow due to error: ${(error as Error).message}`
                            );
                            this.retryCounts.delete(promiseGenerator);
                            this.abort();
                            return allResults; // Exit the function immediately
                    }
                }
            }

            startTime = Date.now();
            try {
                this.logger?.log(`${getFormattedDate()}:Workflow(${this.id}):afterEachTaskGroup:starting`);
    
                await this.executePromisesWithInputs(
                    this.afterEachTaskGroup,
                    groupResults
                );
        
                this.logger?.log(`${getFormattedDate()}:Workflow(${this.id}):afterEachTaskGroup:finished:success:${getElapsedTime(startTime)}`);
                
            } catch (error) {
                this.logger?.error(`${getFormattedDate()}:Workflow(${this.id}):afterEachTaskGroup:finished:error:${getElapsedTime(startTime)}:${error}`);
            }
    
            // Move to the next group size if available
            if (groupIndex < this.pattern.length - 1) {
                groupIndex++;
            }
            allResults.push(groupResults);
        }

        startTime = Date.now();
        try {
            this.logger?.log(`${getFormattedDate()}:Workflow(${this.id}):afterRun:starting`);

            await this.executePromisesWithInputs(this.afterRun, allResults);

            this.logger?.log(`${getFormattedDate()}:Workflow(${this.id}):afterRun:finished:success:${getElapsedTime(startTime)}`);
            
        } catch (error) {
            this.logger?.error(`${getFormattedDate()}:Workflow(${this.id}):afterRun:finished:error:${getElapsedTime(startTime)}:${error}`);
            return allResults;
        }

        this.logger?.info(`${getFormattedDate()}:Workflow(${this.id}):Run ended:${getElapsedTime(overallStartTime)}`);
    }

    // return 0 if no retries, or the first retry count
    // this assumes the number of active tasks is 0 or 1
    get currentTaskRetries() : number {
        if (this.retryCounts.size === 0) {
            return 0;
        } else {
            return this.retryCounts.values().next().value;
        }
    }

    public abort() {
        this.aborted = true;
    }

    private async executePromises(promiseGenerators: PromiseGenerator[]) {
        for (let generatorFactory of promiseGenerators) {
            if (this.aborted) {
                return;
            }
            const generator = generatorFactory();
            await generator();
        }
    }

    private async executePromisesWithInputs(
        promiseGenerators: PromiseGeneratorWithInputs[],
        inputs: any[]
    ) {
        for (let generatorFactory of promiseGenerators) {
            if (this.aborted) {
                return;
            }
            const generator = generatorFactory();
            await generator(inputs);
        }
    }
}