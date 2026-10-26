# [RFC]: Cross-Device Sync Support for Custom Properties

## Motivation.

### Summary

在 [RFC 1 (Library Custom Select Properties System)](./rfc-library-custom-select-properties.md) 中，Agentero 实现了本地 Vault 的自定义属性与选项系统，其定义存储在 `.agentero/properties.json`，而论文取值存放在各论文的 `{paper}/metadata.json` sidecar 中。

然而，现有同步引擎（`features/sync/`）的扫描快照逻辑中，默认忽略了整个 `.agentero/` 隐藏目录（`snapshot.rs: is_ignored_name`）。这导致：
1. 论文的 sidecar 可以正常同步，但属性定义文件 `.agentero/properties.json` 会被排除在同步快照之外。
2. 同步到设备 B 之后，设备 B 只有 `{paper}/metadata.json` 中的 `property_id -> option_id` 键值对，却因缺少定义文件而无法知晓属性名称、选项名和颜色，导致自定义列无法在设备 B 正确还原。

本 RFC 作为后续专项扩展，提议**将自定义属性定义平滑纳入 Agentero 云同步体系（S3 / WebDAV / Git）**，解决多设备漫游一致性与并发变更冲突问题。

### Current Baseline

| Capability | Current State | Limitations / Issues |
|---|---|---|
| 同步扫描忽略规则 | `snapshot.rs: is_ignored_name` 匹配 `".agentero" \| ".git" \| "node_modules" \| ...` | 整个 `.agentero/` 目录被一刀切跳过，使得伴随 Vault 存在的配置无法随库同步。 |
| SQLite 同步模型 | `catalog.sqlite` 不参与文件同步（通过本地 sidecar 回灌重建） | 属性定义若仅存于 SQLite 将无法多端同步；即使存在 `.agentero/properties.json` 也会被现有扫描逻辑过滤。 |
| 多设备并发修改 | 论文 sidecar 依靠基于 mtime / CAS 的文件级冲突处理 | 若两台设备并发新增/修改属性或选项，缺乏纯 JSON 文件的合并策略（3-way merge 或 LWW）。 |

### Target Data Flow

```mermaid
flowchart TD
    subgraph ClientA ["设备 A"]
        Core_A["本地属性定义: .agentero/properties.json"] -->|同步引擎快照 (白名单放行)| Sync_A["features/sync/"]
    end

    subgraph RemoteStorage ["远端对象存储 (S3 / WebDAV / Git)"]
        Sync_A -->|Push Manifest & Blobs| Storage[".agentero/properties.json"]
    end

    subgraph ClientB ["设备 B"]
        Storage -->|Pull & Apply| Sync_B["features/sync/"]
        Sync_B -->|冲突检测 / 落盘| Core_B["本地 .agentero/properties.json"]
        Core_B -->|Rescan 触发| SQLite_B["catalog.sqlite (Schema v10)"]
    end
```

---

## Proposed Change.

| Feature / Area | Detailed Specification | Progress |
|---|---|---|
| **同步扫描白名单例外 (`snapshot.rs`)** | 修改 `crates/agentero-core/src/features/sync/snapshot.rs`，在扫描遍历逻辑中调整忽略判定：对 `.agentero/` 目录本身允许有限深入扫描，仅对 `.agentero/properties.json` 开放白名单，继续严密排除 `.agentero/catalog.sqlite`、`.agentero/sync/` 等运行缓存。 | |
| **定义文件多端并发合并策略** | 当设备 A 与设备 B 在离线状态下分别新增了不同的属性或选项并同步时，同步引擎检测到 `.agentero/properties.json` 的版本冲突。提供基于属性/选项 ID 的集合并集（Union-by-ID）三方合并机制，避免覆盖丢失任一设备创建的新选项。 | |
| **同步拉取后的自动回灌 (Trigger Rescan)** | 当云同步拉取（Pull）检测到 `.agentero/properties.json` 发生外部更新时，自动派发本地生命周期事件，触发 catalog 对 `custom_properties` 表的镜像回灌与前端表格刷新。 | |

---

## Any Other Things.

- **前置依赖**：本 RFC 依赖 [RFC 1: Library Custom Select Properties System](./rfc-library-custom-select-properties.md) 完成本地定义格式与 sidecar 读写闭环。
- **与 SSH 远程模式（`features/remote/`）的关系**：本 RFC 专职服务于 S3 / WebDAV / Git 的多设备同步漫游，不涉及 SSH 会话代理。
