import pytest
from freezegun import freeze_time

from dara.core.internal.cache_store.ttl import TTLCache
from dara.core.internal.cache_store.lru import LRUCache
from dara.core.base_definitions import Cache

pytestmark = pytest.mark.anyio

async def test_lru_cache():
    lru_cache = LRUCache(policy=Cache.Policy.LRU(max_size=3))

    # Test setting values
    await lru_cache.set("a", 1)
    await lru_cache.set("b", 2)
    await lru_cache.set("c", 3)
    assert await lru_cache.get("a") == 1
    assert await lru_cache.get("b") == 2
    assert await lru_cache.get("c") == 3

    # Test LRU eviction
    await lru_cache.set("d", 4)
    assert await lru_cache.get("a") is None  # "a" should be evicted
    assert await lru_cache.get("b") == 2
    assert await lru_cache.get("c") == 3
    assert await lru_cache.get("d") == 4

    # Test move to front on access
    assert await lru_cache.get("b") == 2
    await lru_cache.set("e", 5)
    assert await lru_cache.get("b") == 2  # "b" should still be present
    assert await lru_cache.get("c") is None  # "c" should be evicted

    # Test updating value
    await lru_cache.set("b", 20)
    assert await lru_cache.get("b") == 20  # "b" should be updated

    # Test overwriting key
    await lru_cache.set("d", 40)
    assert await lru_cache.get("d") == 40  # "d" should be updated

    # Test overwriting key
    await lru_cache.set("e", 50)
    assert await lru_cache.get("e") == 50
    assert await lru_cache.get("b") == 20  # "b" should still be present, not evicted

async def test_lru_cache_pinning():
    lru_cache = LRUCache(policy=Cache.Policy.LRU(max_size=3))

    # Test setting and pinning values
    await lru_cache.set("a", 1, pin=True)
    await lru_cache.set("b", 2)
    await lru_cache.set("c", 3)

    # Test LRU eviction with pinning
    await lru_cache.set("d", 4)
    assert await lru_cache.get("a") == 1  # "a" should not be evicted since it's pinned
    assert await lru_cache.get("b") is None  # "b" should be evicted
    assert await lru_cache.get("c") == 3
    assert await lru_cache.get("d") == 4

    # Test automatic unpinning on access
    assert await lru_cache.get("a", unpin=True) == 1  # Accessing "a" should unpin it
    await lru_cache.set("a", 1, pin=True)  # Re-pin "a" before adding "e"
    await lru_cache.set("e", 5)
    assert await lru_cache.get("a") == 1  # "a" should not be evicted since it's re-pinned
    assert await lru_cache.get("c") is None  # "c" should be evicted
    assert await lru_cache.get("d") == 4
    assert await lru_cache.get("e") == 5

    # Test get without unpin
    await lru_cache.set("a", 1, pin=True) # should be a,d,e
    await lru_cache.get("a", unpin=False) # get but do not unpin
    await lru_cache.set("b", 2)
    assert await lru_cache.get("a") == 1  # "a" should not be evicted since it's still pinned

async def test_most_recent_cache():
    cache = LRUCache(policy=Cache.Policy.MostRecent())

    # Test normal access
    await cache.set("a", 1)
    assert await cache.get("a") == 1
    await cache.set("b", 2)
    assert await cache.get("a") is None
    assert await cache.get("b") == 2


    # Test setting and getting values
    await cache.set("a", 1, pin=True)
    assert await cache.get("a") == 1
    await cache.set("b", 2)
    assert await cache.get("a") == 1  # "a" should still be in the cache since it's pinned
    assert await cache.get("b") is None # "b" will immediately be evicted since it overflows the cache

    # here both a and b are pinned, both are kept even though they overflow
    await cache.set("b", 2, pin=True)
    assert await cache.get("b") == 2
    assert await cache.get("a") == 1

    # Unpin a and b
    assert await cache.get("a", unpin=True) == 1
    assert await cache.get("b", unpin=True) == 2
    await cache.set("c", 3)
    # Both a and b should be evicted
    assert await cache.get("a") is None
    assert await cache.get("b") is None
    assert await cache.get("c") == 3


async def test_ttl_cache():
    ttl_cache = TTLCache(policy=Cache.Policy.TTL(ttl=2))

    # Freeze time at a specific moment
    with freeze_time("2023-01-01 12:00:00"):
        # Test setting and getting values
        await ttl_cache.set("a", 1)
        assert await ttl_cache.get("a") == 1
        await ttl_cache.set("b", 2, pin=True)
        assert await ttl_cache.get("b") == 2

    # Move time forward by 3 seconds (past the TTL)
    with freeze_time("2023-01-01 12:00:03"):
        # "a" should be evicted due to TTL expiration, "b" should remain since it's pinned
        assert await ttl_cache.get("a") is None
        assert await ttl_cache.get("b") == 2

        # Unpin "b" and move time forward by another 3 seconds
        assert await ttl_cache.get("b", unpin=True) == 2

    # Move time further forward to test eviction of "b"
    with freeze_time("2023-01-01 12:00:06"):
        # Now "b" should be evicted as well
        assert await ttl_cache.get("b") is None

        # Test automatic unpinning on access
        await ttl_cache.set("c", 3, pin=True)
        assert await ttl_cache.get("c", unpin=True) == 3

    # Move time further forward to test eviction of "c"
    with freeze_time("2023-01-01 12:00:09"):
        assert await ttl_cache.get("c") is None  # "c" should be evicted since it's no longer pinned

    # Move time further forward to test eviction of multiple pinned entries
    with freeze_time("2023-01-01 12:00:10"):
        # Set multiple pinned entries
        await ttl_cache.set("d", 4, pin=True)
        await ttl_cache.set("e", 5, pin=True)
        await ttl_cache.set("f", 6, pin=True)
        assert await ttl_cache.get("d") == 4
        assert await ttl_cache.get("e") == 5
        assert await ttl_cache.get("f") == 6

    # Move time further forward past the TTL
    with freeze_time("2023-01-01 12:00:13"):
        # Unpin all the entries and check they are still present
        assert await ttl_cache.get("d", unpin=True) == 4
        assert await ttl_cache.get("e", unpin=True) == 5
        assert await ttl_cache.get("f", unpin=True) == 6

    # Move time further forward to check if all unpinned entries are evicted
    with freeze_time("2023-01-01 12:00:16"):
        assert await ttl_cache.get("d") is None  # "d" should be evicted since it's no longer pinned
        assert await ttl_cache.get("e") is None  # "e" should be evicted since it's no longer pinned
        assert await ttl_cache.get("f") is None  # "f" should be evicted since it's no longer pinned
