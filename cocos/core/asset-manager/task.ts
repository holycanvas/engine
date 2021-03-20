/*
 Copyright (c) 2019-2020 Xiamen Yaji Software Co., Ltd.

 https://www.cocos.com/

 Permission is hereby granted, free of charge, to any person obtaining a copy
 of this software and associated engine source code (the "Software"), a limited,
  worldwide, royalty-free, non-assignable, revocable and non-exclusive license
 to use Cocos Creator solely to develop games on your target platforms. You shall
  not use Cocos Creator software for developing other software or tools that's
  used for developing games. You are not granted to publish, distribute,
  sublicense, and/or sell copies of Cocos Creator.

 The software or tools in this License Agreement are licensed, not sold.
 Xiamen Yaji Software Co., Ltd. reserves all rights not expressly granted to you.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 THE SOFTWARE.
 */
/**
 * @packageDocumentation
 * @module asset-manager
 */
export type TaskCompleteCallback = (err: Error | null | undefined, data: any) => void;
export type TaskErrorCallback = (...args: any[]) => void;
export type TaskCancelCallback = (...args: any[]) => void;

export class CancelToken {
    public isCanceled = false;
}

/**
 * @en
 * Task is used to run in the pipeline for some effect
 *
 * @zh
 * 任务用于在管线中运行以达成某种效果
 *
 */
export default class Task {
    public static MAX_DEAD_NUM = 500;

    /**
     * @en
     * Create a new task from pool
     *
     * @zh
     * 从对象池中创建 task
     *
     * @static
     * @method create
     * @returns task
     *
     */
    public static create<T extends Task> (type: Constructor<T>): T {
        let out: T;
        const deadPool = Task._deadPool.get(type);
        if (deadPool && deadPool.length > 0) {
            out = deadPool.pop() as T;
        } else {
            out = new type();
        }

        return out;
    }

    private static _taskId = 0;
    private static _deadPool: WeakMap<Constructor<Task>, Task[]> = new WeakMap();

    /**
     * @en
     * The id of task
     *
     * @zh
     * 任务id
     *
     */
    public id: number = Task._taskId++;

    /**
     * @en
     * The callback when task is completed
     *
     * @zh
     * 完成回调
     *
     */
    public onComplete: TaskCompleteCallback | null = null;

    /**
     * @en
     * The callback of progression
     *
     * @zh
     * 进度回调
     *
     */
    public onCancel: TaskCancelCallback | null = null;

    /**
     * @en
     * The callback when something goes wrong
     *
     * @zh
     * 错误回调
     *
     */
    public onError: TaskErrorCallback | null = null;

    public subTasks: Task[] = [];

    public cancelToken: CancelToken | null = null;

    /**
     * @en
     * The output of task
     *
     * @zh
     * 任务的输出
     */
    public output: any = null;

    /**
     * @en
     * The input of task
     *
     * @zh
     * 任务的输入
     *
     */
    public input: any = null;

    /**
     * @en
     * Custom options
     *
     * @zh
     * 自定义参数
     *
     */
    public options: Record<string, any> | null = null;

    /**
     * @en
     * Whether or not this task is completed
     *
     * @zh
     * 此任务是否已经完成
     *
     */
    public isFinish = true;

    public error: Error | null = null;

    public executed = -1;

    public period = 0;

    public priority = -1;

    public get dependsFinished () {
        return this.dependFinishCount === this.dependTotalCount;
    }

    private dependFinishCount = 0;

    private dependTotalCount = 0;

    private observers: Task[] = [];

    public dependsOn (task: Task | Task[]) {
        this.period++;
        if (Array.isArray(task)) {
            task.forEach(t => {
                if (t.isFinish) { 
                    this.dependFinishCount++;
                } else {
                    t.observers.push(this);
                }
            });
            this.dependTotalCount += task.length;
        } else {
            if (task.isFinish) { 
                this.dependFinishCount++;
            } else {
                task.observers.push(this);
            }
            this.dependTotalCount++;
        }
    }

    public cancel () {
        this.dispatch('cancel');
    }

    public complete () {
        this.observers.forEach(x => x.dependFinishCount++);
        this.observers.length = 0;
        this.dispatch('complete', this.output);
    }

    /**
     * @en
     * Dispatch event
     *
     * @zh
     * 发布事件
     *
     * @param event - The event name
     * @param param1 - Parameter 1
     * @param param2 - Parameter 2
     * @param param3 - Parameter 3
     * @param param4 - Parameter 4
     *
     * @example
     * var task = Task.create();
     * Task.onComplete = (msg) => console.log(msg);
     * Task.dispatch('complete', 'hello world');
     *
     */
    public dispatch (event: string, param1?: any, param2?: any, param3?: any, param4?: any): void {
        switch (event) {
            case 'complete':
                if (this.onComplete) {
                    this.onComplete(param1, param2);
                }
                break;
            case 'error':
                if (this.onError) {
                    this.onError(param1, param2, param3, param4);
                }
                break;
            case 'cancel':
                if (this.onCancel) {
                    this.onCancel(param1, param2, param3, param4);
                }
            default: {
                const str = `on${event[0].toUpperCase()}${event.substr(1)}`;
                if (typeof this[str] === 'function') {
                    this[str](param1, param2, param3, param4);
                }
                break;
            }
        }
    }

    public done (err?: Error) {
        if (err) { 
            this.error = err; 
        }
        this.period++;
    }
    /**
     * @en
     * Recycle this for reuse
     *
     * @zh
     * 回收 task 用于复用
     *
     */
    public recycle (): boolean {
        let deadPool = Task._deadPool.get(this.constructor as Constructor<Task>);
        if (!deadPool) {
            deadPool = [];
            Task._deadPool.set(this.constructor as Constructor<Task>, deadPool);
        }
        if (deadPool.length === Task.MAX_DEAD_NUM) { return false }
        this.onComplete = null;
        this.onCancel = null;
        this.onError = null;
        this.output = this.input = null;
        this.options = null;
        this.cancelToken = null;
        this.period = -1;
        this.error = null;
        this.subTasks.length = 0;
        deadPool.push(this);
        return true;
    }
}
