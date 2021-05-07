import { js } from "../utils/js";

export class GarbageCollectorContext {

}

export interface IGarbageCollectable {
    markDependencies? (context: GarbageCollectorContext): void;
}

export function referenced <T extends IGarbageCollectable> (target: T, propertyName: string, descriptor: any): void {
    garbageCollectManager.registerGarbageCollectableProperty(target.constructor as Constructor<IGarbageCollectable>, propertyName);
}

class GarbageCollectManager {
    private _garbageCollectableProperties: Map<Constructor<IGarbageCollectable>, Set<string>> = new Map();
    private _garbageCollectableRoots: Set<IGarbageCollectable> = new Set();

    public registerGarbageCollectableProperty (ctor: Constructor<IGarbageCollectable>, propertyName: string) {
        if (this._garbageCollectableProperties.has(ctor)) {
            this._garbageCollectableProperties.get(ctor)?.add(propertyName);
        } else {
            const parentClass = js.getSuper(ctor as Constructor<any>);
            const parentCollectableProperties = this._garbageCollectableProperties.get(parentClass);
            const collectableProperties = parentCollectableProperties ? new Set(parentCollectableProperties) : new Set<string>();
            collectableProperties.add(propertyName);
            this._garbageCollectableProperties.set(ctor, collectableProperties);
        }
    }

    public hasGarbageCollectableProperty (ctor: Constructor<IGarbageCollectable>) {
        return this._garbageCollectableProperties.has(ctor);
    }

    public registerGarbageCollectableRoot (root: IGarbageCollectable) {
        this._garbageCollectableRoots.add(root);
    }

    public unregisterGarbageCollectableRoot (root: IGarbageCollectable) {
        this._garbageCollectableRoots.delete(root);
    }
}

class GarbageCollectState {

}

const garbageCollectManager = new GarbageCollectManager();
export { garbageCollectManager };