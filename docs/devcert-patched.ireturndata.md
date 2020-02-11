<!-- Do not edit this file. It is automatically generated by API Documenter. -->

[Home](./index.md) &gt; [@mike-north/devcert-patched](./devcert-patched.md) &gt; [IReturnData](./devcert-patched.ireturndata.md)

## IReturnData type

A return value containing the CA public key, CA path on disk, and domain cert info

<b>Signature:</b>

```typescript
export declare type IReturnData<O extends Options = {}> = DomainData & IReturnCa<O> & IReturnCaPath<O>;
```