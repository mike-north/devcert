<!-- Do not edit this file. It is automatically generated by API Documenter. -->

[Home](./index.md) &gt; [@mike-north/devcert-patched](./devcert-patched.md) &gt; [certificateFor](./devcert-patched.certificatefor_1.md)

## certificateFor() function

Request an SSL certificate for the given app name signed by the devcert root certificate authority. If devcert has previously generated a certificate for that app name on this machine, it will reuse that certificate.

If this is the first time devcert is being run on this machine, it will generate and attempt to install a root certificate authority.

If `options.getCaBuffer` is true, return value will include the ca certificate data as { ca: Buffer }

If `options.getCaPath` is true, return value will include the ca certificate path as { caPath: string }

<b>Signature:</b>

```typescript
export declare function certificateFor<O extends Options, CO extends Partial<CertOptions>>(commonName: string, options?: O, partialCertOptions?: CO): Promise<IReturnData<O>>;
```

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  commonName | <code>string</code> | common name for certificate |
|  options | <code>O</code> | cert generation options |
|  partialCertOptions | <code>CO</code> | certificate options |

<b>Returns:</b>

`Promise<IReturnData<O>>`

