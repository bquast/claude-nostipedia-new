// Nostr protocol implementation for NIP-54 wiki articles
class NostrClient {
    constructor() {
        this.relays = new Map();
        this.subscriptions = new Map();
        this.eventCache = new Map();
    }

    // Connect to a relay
    async connectRelay(url) {
        if (this.relays.has(url)) {
            return this.relays.get(url);
        }

        return new Promise((resolve, reject) => {
            try {
                const ws = new WebSocket(url);
                const relay = {
                    url,
                    ws,
                    connected: false,
                    subscriptions: new Set()
                };

                ws.onopen = () => {
                    relay.connected = true;
                    this.relays.set(url, relay);
                    console.log(`Connected to ${url}`);
                    resolve(relay);
                };

                ws.onerror = (err) => {
                    console.error(`Error connecting to ${url}:`, err);
                    reject(err);
                };

                ws.onclose = () => {
                    relay.connected = false;
                    console.log(`Disconnected from ${url}`);
                };

                ws.onmessage = (msg) => {
                    this.handleMessage(url, msg.data);
                };

                // Timeout after 5 seconds
                setTimeout(() => {
                    if (!relay.connected) {
                        ws.close();
                        reject(new Error('Connection timeout'));
                    }
                }, 5000);
            } catch (err) {
                reject(err);
            }
        });
    }

    // Disconnect from a relay
    disconnectRelay(url) {
        const relay = this.relays.get(url);
        if (relay) {
            relay.ws.close();
            this.relays.delete(url);
        }
    }

    // Handle incoming messages
    handleMessage(relayUrl, data) {
        try {
            const message = JSON.parse(data);
            const [type, ...rest] = message;

            switch (type) {
                case 'EVENT':
                    this.handleEvent(relayUrl, rest[0], rest[1]);
                    break;
                case 'EOSE':
                    this.handleEOSE(rest[0]);
                    break;
                case 'NOTICE':
                    console.log(`Notice from ${relayUrl}:`, rest[0]);
                    break;
            }
        } catch (err) {
            console.error('Error parsing message:', err);
        }
    }

    // Handle event
    handleEvent(relayUrl, subId, event) {
        if (!this.verifyEvent(event)) {
            console.warn('Invalid event signature');
            return;
        }

        // Cache event
        this.eventCache.set(event.id, event);

        // Call subscription callback
        const sub = this.subscriptions.get(subId);
        if (sub && sub.callback) {
            sub.callback(event);
        }
    }

    // Handle end of stored events
    handleEOSE(subId) {
        const sub = this.subscriptions.get(subId);
        if (sub && sub.onEOSE) {
            sub.onEOSE();
        }
    }

    // Subscribe to events
    subscribe(filters, callback, onEOSE) {
        const subId = this.generateSubId();
        
        this.subscriptions.set(subId, {
            filters,
            callback,
            onEOSE
        });

        // Send REQ to all connected relays
        const req = JSON.stringify(['REQ', subId, ...filters]);
        
        for (const [url, relay] of this.relays) {
            if (relay.connected) {
                relay.ws.send(req);
                relay.subscriptions.add(subId);
            }
        }

        return subId;
    }

    // Unsubscribe
    unsubscribe(subId) {
        this.subscriptions.delete(subId);

        const close = JSON.stringify(['CLOSE', subId]);
        
        for (const [url, relay] of this.relays) {
            if (relay.connected && relay.subscriptions.has(subId)) {
                relay.ws.send(close);
                relay.subscriptions.delete(subId);
            }
        }
    }

    // Publish event
    async publishEvent(event) {
        const signedEvent = await this.signEvent(event);
        const msg = JSON.stringify(['EVENT', signedEvent]);

        const promises = [];
        for (const [url, relay] of this.relays) {
            if (relay.connected) {
                promises.push(
                    new Promise((resolve) => {
                        relay.ws.send(msg);
                        resolve();
                    })
                );
            }
        }

        return Promise.all(promises);
    }

    // Generate subscription ID
    generateSubId() {
        return 'sub_' + Math.random().toString(36).substr(2, 9);
    }

    // Simple event verification (basic check)
    verifyEvent(event) {
        // In production, this should verify the signature
        // For now, just basic structure validation
        return (
            event.id &&
            event.pubkey &&
            event.created_at &&
            event.kind !== undefined &&
            Array.isArray(event.tags) &&
            event.content !== undefined
        );
    }

    // Sign event (placeholder - in production use NIP-07 or private key)
    async signEvent(event) {
        // This is a placeholder. In production:
        // - Use window.nostr (NIP-07) if available
        // - Or implement proper signing with private key
        
        const eventData = {
            ...event,
            id: this.generateEventId(event),
            sig: 'placeholder_signature'
        };

        return eventData;
    }

    // Generate event ID
    generateEventId(event) {
        // Simplified - in production use proper SHA256 of serialized event
        return Array.from(crypto.getRandomValues(new Uint8Array(32)))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
    }

    // Get all connected relays
    getConnectedRelays() {
        return Array.from(this.relays.values()).filter(r => r.connected);
    }

    // Check if relay is connected
    isRelayConnected(url) {
        const relay = this.relays.get(url);
        return relay && relay.connected;
    }
}

// NIP-54 specific helpers
class WikiClient {
    constructor(nostrClient) {
        this.nostr = nostrClient;
        this.KIND_WIKI = 30818; // NIP-54 wiki article kind
    }

    // Search for wiki articles
    async searchArticles(query, limit = 20) {
        return new Promise((resolve, reject) => {
            const results = [];
            const timeout = setTimeout(() => {
                this.nostr.unsubscribe(subId);
                resolve(results);
            }, 5000);

            const subId = this.nostr.subscribe(
                [{
                    kinds: [this.KIND_WIKI],
                    limit
                }],
                (event) => {
                    articles.push(this.parseArticle(event));
                },
                () => {
                    clearTimeout(timeout);
                    this.nostr.unsubscribe(subId);
                    // Sort by date
                    articles.sort((a, b) => b.timestamp - a.timestamp);
                    resolve(articles);
                }
            );
        });
    }

    // Parse article from event
    parseArticle(event) {
        const article = {
            id: event.id,
            pubkey: event.pubkey,
            timestamp: event.created_at,
            content: event.content,
            title: '',
            summary: '',
            tags: []
        };

        // Parse tags
        for (const tag of event.tags) {
            const [tagName, ...values] = tag;
            switch (tagName) {
                case 'd':
                    article.title = values[0] || '';
                    break;
                case 'title':
                    article.displayTitle = values[0] || '';
                    break;
                case 'summary':
                    article.summary = values[0] || '';
                    break;
                case 't':
                    article.tags.push(values[0]);
                    break;
            }
        }

        // Use displayTitle if available, otherwise use 'd' tag
        if (!article.title && article.displayTitle) {
            article.title = article.displayTitle;
        }

        return article;
    }

    // Format pubkey for display
    formatPubkey(pubkey) {
        if (!pubkey) return 'Unknown';
        return pubkey.slice(0, 8) + '...' + pubkey.slice(-8);
    }

    // Format timestamp
    formatTimestamp(timestamp) {
        const date = new Date(timestamp * 1000);
        return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
    }
}

// Export for use in app.js
window.NostrClient = NostrClient;
window.WikiClient = WikiClient;WIKI],
                    limit
                }],
                (event) => {
                    const article = this.parseArticle(event);
                    if (query && article.title.toLowerCase().includes(query.toLowerCase())) {
                        results.push(article);
                    } else if (!query) {
                        results.push(article);
                    }
                },
                () => {
                    clearTimeout(timeout);
                    this.nostr.unsubscribe(subId);
                    resolve(results);
                }
            );
        });
    }

    // Get article by title
    async getArticle(title) {
        return new Promise((resolve, reject) => {
            let found = null;
            const timeout = setTimeout(() => {
                this.nostr.unsubscribe(subId);
                resolve(found);
            }, 5000);

            const subId = this.nostr.subscribe(
                [{
                    kinds: [this.KIND_WIKI],
                    '#d': [title]
                }],
                (event) => {
                    found = this.parseArticle(event);
                },
                () => {
                    clearTimeout(timeout);
                    this.nostr.unsubscribe(subId);
                    resolve(found);
                }
            );
        });
    }

    // Get article versions (by different authors)
    async getArticleVersions(title) {
        return new Promise((resolve, reject) => {
            const versions = [];
            const timeout = setTimeout(() => {
                this.nostr.unsubscribe(subId);
                resolve(versions);
            }, 5000);

            const subId = this.nostr.subscribe(
                [{
                    kinds: [this.KIND_WIKI],
                    '#d': [title]
                }],
                (event) => {
                    versions.push(this.parseArticle(event));
                },
                () => {
                    clearTimeout(timeout);
                    this.nostr.unsubscribe(subId);
                    resolve(versions);
                }
            );
        });
    }

    // Get recent changes
    async getRecentChanges(limit = 20) {
        return new Promise((resolve, reject) => {
            const articles = [];
            const timeout = setTimeout(() => {
                this.nostr.unsubscribe(subId);
                resolve(articles);
            }, 5000);

            const subId = this.nostr.subscribe(
                [{
                    kinds: [this.KIND_