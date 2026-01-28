import { Platform } from 'react-native';
import structuredClone from '@ungap/structured-clone';
import { TransformStream, ReadableStream, WritableStream } from 'web-streams-polyfill';
import { TextEncoderStream, TextDecoderStream } from '@stardazed/streams-text-encoding';
import { AppRegistry } from 'react-native';
import RootNavigator from './src/RootNavigator';
import { name as appName } from './app.json';

if (typeof process === 'undefined') {
    global.process = { env: {} };
}

if (Platform.OS !== 'web') {
    global.TransformStream = TransformStream;
    global.ReadableStream = ReadableStream;
    global.WritableStream = WritableStream;
    global.TextEncoderStream = TextEncoderStream;
    global.TextDecoderStream = TextDecoderStream;
    global.structuredClone = structuredClone;

    // Polyfill URL with protocol, pathname, hostname, and other properties
    // React Native's URL implementation is incomplete and throws errors for these
    const OriginalURL = global.URL;
    
    class PolyfillURL {
        constructor(url, base) {
            // Store the original URL string
            if (base) {
                // Handle relative URLs with base
                if (typeof base === 'string') {
                    this._fullUrl = new OriginalURL(url, base).toString();
                } else {
                    this._fullUrl = new OriginalURL(url, base.toString()).toString();
                }
            } else {
                this._fullUrl = url;
            }
            this._url = this._fullUrl;
            this._parseUrl();
        }

        _parseUrl() {
            const urlStr = this._fullUrl;
            
            // Parse protocol (e.g., "https:", "file:", "data:")
            const protocolMatch = urlStr.match(/^([a-zA-Z][a-zA-Z0-9+.-]*:)/);
            this._protocol = protocolMatch ? protocolMatch[1] : '';
            
            // Parse the rest based on protocol
            let rest = urlStr.slice(this._protocol.length);
            
            // Handle data: URLs specially
            if (this._protocol === 'data:') {
                this._hostname = '';
                this._host = '';
                this._port = '';
                this._pathname = rest;
                this._search = '';
                this._hash = '';
                this._origin = 'null';
                this._username = '';
                this._password = '';
                return;
            }
            
            // Remove leading slashes for authority parsing
            if (rest.startsWith('//')) {
                rest = rest.slice(2);
            }
            
            // Parse hash
            const hashIndex = rest.indexOf('#');
            if (hashIndex !== -1) {
                this._hash = rest.slice(hashIndex);
                rest = rest.slice(0, hashIndex);
            } else {
                this._hash = '';
            }
            
            // Parse search/query
            const searchIndex = rest.indexOf('?');
            if (searchIndex !== -1) {
                this._search = rest.slice(searchIndex);
                rest = rest.slice(0, searchIndex);
            } else {
                this._search = '';
            }
            
            // Parse authority (user:pass@host:port) and path
            const pathIndex = rest.indexOf('/');
            let authority = pathIndex !== -1 ? rest.slice(0, pathIndex) : rest;
            this._pathname = pathIndex !== -1 ? rest.slice(pathIndex) : '/';
            
            // Parse username:password
            const atIndex = authority.indexOf('@');
            if (atIndex !== -1) {
                const userInfo = authority.slice(0, atIndex);
                authority = authority.slice(atIndex + 1);
                const colonIndex = userInfo.indexOf(':');
                if (colonIndex !== -1) {
                    this._username = userInfo.slice(0, colonIndex);
                    this._password = userInfo.slice(colonIndex + 1);
                } else {
                    this._username = userInfo;
                    this._password = '';
                }
            } else {
                this._username = '';
                this._password = '';
            }
            
            // Parse host and port
            const portMatch = authority.match(/:(\d+)$/);
            if (portMatch) {
                this._port = portMatch[1];
                this._hostname = authority.slice(0, -portMatch[0].length);
            } else {
                this._port = '';
                this._hostname = authority;
            }
            
            this._host = this._port ? `${this._hostname}:${this._port}` : this._hostname;
            this._origin = this._protocol ? `${this._protocol}//${this._host}` : '';
        }

        get protocol() { return this._protocol; }
        get hostname() { return this._hostname; }
        get host() { return this._host; }
        get port() { return this._port; }
        get pathname() { return this._pathname; }
        get search() { return this._search; }
        get hash() { return this._hash; }
        get origin() { return this._origin; }
        get username() { return this._username; }
        get password() { return this._password; }
        get href() { return this._fullUrl; }
        
        get searchParams() {
            if (!this._searchParams) {
                this._searchParams = new URLSearchParams(this._search);
            }
            return this._searchParams;
        }

        toString() { return this._fullUrl; }
        toJSON() { return this._fullUrl; }

        static createObjectURL(blob) {
            return OriginalURL.createObjectURL(blob);
        }

        static revokeObjectURL(url) {
            return OriginalURL.revokeObjectURL(url);
        }
    }

    global.URL = PolyfillURL;

    const setupPolyfills = async () => {
        const { polyfillGlobal } = await import(
            'react-native/Libraries/Utilities/PolyfillFunctions'
        );

        const { TextEncoderStream, TextDecoderStream } = await import(
            '@stardazed/streams-text-encoding'
        );

        if (!('structuredClone' in global)) {
            console.log('Polyfilling structuredClone');
            polyfillGlobal('structuredClone', () => structuredClone);
        }

        polyfillGlobal('TextEncoderStream', () => TextEncoderStream);
        polyfillGlobal('TextDecoderStream', () => TextDecoderStream);
    };

    setupPolyfills();
}

AppRegistry.registerComponent(appName, () => RootNavigator);
