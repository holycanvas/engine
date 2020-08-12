
/**
 * @en
 * Cache manager is a module which controls all caches downloaded from server in non-web platform, it is a singleton
 * All member can be accessed with `cc.assetManager.cacheManager`.
 *
 * @zh
 * 缓存管理器是一个模块，在非 WEB 平台上，用于管理所有从服务器上下载下来的缓存，这是一个单例，所有成员能通过 `cc.assetManager.cacheManager` 访问。
 *
 */
export default abstract class CacheManager {
    /**
     * @en
     * The name of cacheDir
     *
     * @zh
     * 缓存目录的名称
     */
    public abstract cacheDir: String;

    /**
     * @en
     * Whether or not cache asset into user's storage space, this property only works on mini-game platforms
     *
     * @zh
     * 是否缓存资源到用户存储空间，此属性只在小游戏平台有效
     *
     */
    public abstract cacheEnabled: Boolean;

    /**
     * @en
     * Whether or not auto clear cache when storage ran out, this property only works on mini-game platforms
     *
     * @zh
     * 是否在存储空间满了后自动清理缓存，此属性只在小游戏平台有效
     *
     */
    public abstract autoClear: Boolean;

    /**
     * @en
     * The interval between caching resources, this property only works on mini-game platforms, unit: ms
     *
     * @zh
     * 缓存资源的间隔时间，此属性只在小游戏平台有效，单位：毫秒
     *
     */
    public abstract cacheInterval: Number;

    /**
     * @en
     * The interval between deleting resources, when you use `cleanLRU`, the resources will be deleted as this interval, unit: ms
     *
     * @zh
     * 清理资源的间隔时间，当你使用 `cleanLRU` 时，资源将以此间隔被删除，单位：毫秒
     *
     */
    public abstract deleteInterval: Number;

    /**
     * @en
     * Get cached path with origin url
     *
     * @zh
     * 通过原始 url 获取缓存后的路径
     *
     * @param originUrl
     * @returns The cached path
     */
    public abstract getCache (originUrl: string): string;

    /**
     * @en
     * Get temporary path with origin url, this method only works on mini-game platforms
     *
     * @zh
     * 通过原始 url 获取临时文件的路径，此方法只在小游戏平台有效
     *
     * @param originUrl
     * @returns The temp path
     */
    public abstract getTemp (originUrl: string): string;

    /**
     * @en
     * Clear all caches, please use with caution, If necessary, we recommend using it before the game is launched
     *
     * @zh
     * 清空所有缓存，请谨慎使用，如果必要的话，我们建议在游戏启动之前使用
     *
     */
    public abstract clearCache (): void;

    /**
     * @en
     * Clear part of caches with LRU strategy
     *
     * @zh
     * 使用 LRU 策略清空部分缓存
     *
     */
    public abstract clearLRU (): void;

    /**
     * @en
     * Remove cache with origin url
     *
     * @zh
     * 通过原始 url 移除缓存
     *
     */
    public abstract removeCache (originUrl: string): void;
}
