// Main application logic
class NostipediaApp {
    constructor() {
        this.nostrClient = new NostrClient();
        this.wikiClient = new WikiClient(this.nostrClient);
        this.currentArticle = null;
        this.compareMode = false;
        this.leftArticle = null;
        this.rightArticle = null;
        
        this.init();
    }

    async init() {
        this.setupEventListeners();
        this.loadRelays();
        await this.connectToRelays();
        this.updateRelayList();
    }

    // Setup event listeners
    setupEventListeners() {
        // Sidebar toggle
        document.getElementById('sidebarToggle').addEventListener('click', () => {
            document.getElementById('sidebar').classList.toggle('collapsed');
        });

        // Search button
        document.getElementById('searchBtn').addEventListener('click', () => {
            this.toggleSearch();
        });

        // Close search
        document.getElementById('closeSearchBtn').addEventListener('click', () => {
            this.toggleSearch();
        });

        // Search input
        document.getElementById('searchInput').addEventListener('input', (e) => {
            this.handleSearch(e.target.value);
        });

        // Compare button
        document.getElementById('compareBtn').addEventListener('click', () => {
            this.toggleCompare();
        });

        // Close compare
        document.getElementById('closeCompareBtn').addEventListener('click', () => {
            this.toggleCompare();
        });

        // Article selects
        document.getElementById('leftArticleSelect').addEventListener('change', (e) => {
            this.loadArticleVersion(e.target.value, 'left');
        });

        document.getElementById('rightArticleSelect').addEventListener('change', (e) => {
            this.loadArticleVersion(e.target.value, 'right');
        });

        // Add relay
        document.getElementById('addRelayBtn').addEventListener('click', () => {
            this.showAddRelayModal();
        });

        // Modal buttons
        document.getElementById('cancelRelayBtn').addEventListener('click', () => {
            this.hideAddRelayModal();
        });

        document.getElementById('confirmRelayBtn').addEventListener('click', () => {
            this.addRelay();
        });

        // Navigation
        document.querySelectorAll('[data-action]').forEach(el => {
            el.addEventListener('click', (e) => {
                e.preventDefault();
                this.handleNavigation(e.target.dataset.action);
            });
        });
    }

    // Load relays from storage
    loadRelays() {
        const defaultRelays = [
            'wss://relay.damus.io',
            'wss://relay.nostr.band',
            'wss://nos.lol'
        ];

        const stored = this.getStoredRelays();
        this.relays = stored.length > 0 ? stored : defaultRelays;
    }

    // Get stored relays
    getStoredRelays() {
        // Since we can't use localStorage, store in memory
        // In production, this could use KV storage via API
        return window.appRelays || [];
    }

    // Store relays
    storeRelays() {
        window.appRelays = this.relays;
    }

    // Connect to all relays
    async connectToRelays() {
        const promises = this.relays.map(url => 
            this.nostrClient.connectRelay(url).catch(err => {
                console.error(`Failed to connect to ${url}:`, err);
            })
        );

        await Promise.allSettled(promises);
        this.updateRelayList();
    }

    // Update relay list UI
    updateRelayList() {
        const container = document.getElementById('relayList');
        container.innerHTML = '';

        this.relays.forEach(url => {
            const item = document.createElement('div');
            item.className = 'relay-item';

            const status = document.createElement('div');
            status.className = 'relay-status';
            status.classList.add(
                this.nostrClient.isRelayConnected(url) ? 'connected' : 'disconnected'
            );

            const urlSpan = document.createElement('span');
            urlSpan.className = 'relay-url';
            urlSpan.textContent = url;

            const removeBtn = document.createElement('button');
            removeBtn.className = 'relay-remove';
            removeBtn.innerHTML = '×';
            removeBtn.onclick = () => this.removeRelay(url);

            item.appendChild(status);
            item.appendChild(urlSpan);
            item.appendChild(removeBtn);
            container.appendChild(item);
        });
    }

    // Show add relay modal
    showAddRelayModal() {
        document.getElementById('addRelayModal').style.display = 'flex';
        document.getElementById('relayInput').value = '';
        document.getElementById('relayInput').focus();
    }

    // Hide add relay modal
    hideAddRelayModal() {
        document.getElementById('addRelayModal').style.display = 'none';
    }

    // Add relay
    async addRelay() {
        const input = document.getElementById('relayInput');
        const url = input.value.trim();

        if (!url.startsWith('wss://') && !url.startsWith('ws://')) {
            alert('Relay URL must start with wss:// or ws://');
            return;
        }

        if (this.relays.includes(url)) {
            alert('Relay already added');
            return;
        }

        this.hideAddRelayModal();
        this.showLoading();

        try {
            await this.nostrClient.connectRelay(url);
            this.relays.push(url);
            this.storeRelays();
            this.updateRelayList();
        } catch (err) {
            alert(`Failed to connect to relay: ${err.message}`);
        } finally {
            this.hideLoading();
        }
    }

    // Remove relay
    removeRelay(url) {
        if (confirm(`Remove relay ${url}?`)) {
            this.nostrClient.disconnectRelay(url);
            this.relays = this.relays.filter(r => r !== url);
            this.storeRelays();
            this.updateRelayList();
        }
    }

    // Toggle search panel
    toggleSearch() {
        const panel = document.getElementById('searchPanel');
        const isVisible = panel.style.display !== 'none';
        
        if (isVisible) {
            panel.style.display = 'none';
        } else {
            panel.style.display = 'block';
            document.getElementById('searchInput').focus();
            this.handleSearch('');
        }
    }

    // Handle search
    async handleSearch(query) {
        const resultsContainer = document.getElementById('searchResults');
        
        if (query.length < 2 && query.length > 0) {
            resultsContainer.innerHTML = '<div class="search-result-item">Type at least 2 characters...</div>';
            return;
        }

        this.showLoading();

        try {
            const articles = await this.wikiClient.searchArticles(query, 20);
            
            if (articles.length === 0) {
                resultsContainer.innerHTML = '<div class="search-result-item">No articles found</div>';
            } else {
                resultsContainer.innerHTML = '';
                articles.forEach(article => {
                    const item = this.createSearchResultItem(article);
                    resultsContainer.appendChild(item);
                });
            }
        } catch (err) {
            console.error('Search error:', err);
            resultsContainer.innerHTML = '<div class="search-result-item">Error searching articles</div>';
        } finally {
            this.hideLoading();
        }
    }

    // Create search result item
    createSearchResultItem(article) {
        const item = document.createElement('div');
        item.className = 'search-result-item';
        item.onclick = () => {
            this.loadArticle(article);
            this.toggleSearch();
        };

        const title = document.createElement('div');
        title.className = 'search-result-title';
        title.textContent = article.title || article.displayTitle || 'Untitled';

        const meta = document.createElement('div');
        meta.className = 'search-result-meta';
        meta.textContent = `By ${this.wikiClient.formatPubkey(article.pubkey)} • ${this.wikiClient.formatTimestamp(article.timestamp)}`;

        item.appendChild(title);
        item.appendChild(meta);

        return item;
    }

    // Load article
    async loadArticle(article) {
        this.currentArticle = article;
        
        document.getElementById('articleTitle').textContent = article.title || 'Untitled';
        document.getElementById('articleAuthor').textContent = `By ${this.wikiClient.formatPubkey(article.pubkey)}`;
        document.getElementById('articleDate').textContent = this.wikiClient.formatTimestamp(article.timestamp);
        document.getElementById('articleContent').innerHTML = this.renderMarkdown(article.content);

        this.updateArticleInfo(article);

        // Load versions for compare mode
        if (this.compareMode) {
            await this.loadArticleVersionsForCompare(article.title);
        }
    }

    // Update article info sidebar
    updateArticleInfo(article) {
        const container = document.getElementById('articleInfo');
        container.innerHTML = `
            <p class="info-text"><strong>Title:</strong> ${article.title}</p>
            <p class="info-text"><strong>Author:</strong> ${this.wikiClient.formatPubkey(article.pubkey)}</p>
            <p class="info-text"><strong>Updated:</strong> ${this.wikiClient.formatTimestamp(article.timestamp)}</p>
            ${article.summary ? `<p class="info-text"><strong>Summary:</strong> ${article.summary}</p>` : ''}
            ${article.tags.length > 0 ? `<p class="info-text"><strong>Tags:</strong> ${article.tags.join(', ')}</p>` : ''}
        `;
    }

    // Toggle compare mode
    async toggleCompare() {
        this.compareMode = !this.compareMode;
        
        const comparePanel = document.getElementById('comparePanel');
        const articleContainer = document.getElementById('articleContainer');
        const secondaryArticle = document.getElementById('secondaryArticle');

        if (this.compareMode) {
            comparePanel.style.display = 'block';
            articleContainer.classList.add('compare-mode');
            
            if (this.currentArticle) {
                await this.loadArticleVersionsForCompare(this.currentArticle.title);
            }
        } else {
            comparePanel.style.display = 'none';
            articleContainer.classList.remove('compare-mode');
            secondaryArticle.style.display = 'none';
        }
    }

    // Load article versions for compare
    async loadArticleVersionsForCompare(title) {
        this.showLoading();

        try {
            const versions = await this.wikiClient.getArticleVersions(title);
            
            const leftSelect = document.getElementById('leftArticleSelect');
            const rightSelect = document.getElementById('rightArticleSelect');

            leftSelect.innerHTML = '<option value="">Select left article...</option>';
            rightSelect.innerHTML = '<option value="">Select right article...</option>';

            versions.forEach((article, idx) => {
                const option = document.createElement('option');
                option.value = idx;
                option.textContent = `${this.wikiClient.formatPubkey(article.pubkey)} - ${this.wikiClient.formatTimestamp(article.timestamp)}`;
                
                leftSelect.appendChild(option.cloneNode(true));
                rightSelect.appendChild(option);
            });

            // Store versions for later retrieval
            this.compareVersions = versions;

        } catch (err) {
            console.error('Error loading versions:', err);
        } finally {
            this.hideLoading();
        }
    }

    // Load article version
    loadArticleVersion(index, side) {
        if (!this.compareVersions || index === '') return;

        const article = this.compareVersions[parseInt(index)];
        const secondaryArticle = document.getElementById('secondaryArticle');

        if (side === 'left') {
            this.leftArticle = article;
            this.loadArticle(article);
        } else {
            this.rightArticle = article;
            secondaryArticle.style.display = 'block';
            document.getElementById('articleTitle2').textContent = article.title || 'Untitled';
            document.getElementById('articleAuthor2').textContent = `By ${this.wikiClient.formatPubkey(article.pubkey)}`;
            document.getElementById('articleDate2').textContent = this.wikiClient.formatTimestamp(article.timestamp);
            document.getElementById('articleContent2').innerHTML = this.renderMarkdown(article.content);
        }
    }

    // Handle navigation
    async handleNavigation(action) {
        switch (action) {
            case 'home':
                this.showHome();
                break;
            case 'recent':
                await this.showRecentChanges();
                break;
            case 'random':
                await this.showRandomArticle();
                break;
        }
    }

    // Show home
    showHome() {
        document.getElementById('articleTitle').textContent = 'Welcome to nostipedia';
        document.getElementById('articleAuthor').textContent = '';
        document.getElementById('articleDate').textContent = '';
        document.getElementById('articleContent').innerHTML = `
            <p>nostipedia is a decentralized wiki powered by Nostr (NIP-54).</p>
            <p>Search for an article using the search button above, or explore recent changes from the sidebar.</p>
            <h2>Getting Started</h2>
            <p>This client connects to Nostr relays to fetch wiki articles. Add your preferred relays in the sidebar to get started.</p>
        `;
        this.currentArticle = null;
        this.updateArticleInfo({ title: 'Home' });
    }

    // Show recent changes
    async showRecentChanges() {
        this.showLoading();

        try {
            const articles = await this.wikiClient.getRecentChanges(20);
            
            let html = '<h2>Recent Changes</h2>';
            
            if (articles.length === 0) {
                html += '<p>No recent changes found. Make sure you are connected to relays.</p>';
            } else {
                html += '<ul>';
                articles.forEach(article => {
                    html += `<li><a href="#" data-article-id="${article.id}">${article.title || 'Untitled'}</a> - ${this.wikiClient.formatPubkey(article.pubkey)} - ${this.wikiClient.formatTimestamp(article.timestamp)}</li>`;
                });
                html += '</ul>';
            }

            document.getElementById('articleContent').innerHTML = html;
            document.getElementById('articleTitle').textContent = 'Recent Changes';
            document.getElementById('articleAuthor').textContent = '';
            document.getElementById('articleDate').textContent = '';

            // Add click handlers
            document.querySelectorAll('[data-article-id]').forEach(el => {
                el.addEventListener('click', (e) => {
                    e.preventDefault();
                    const article = articles.find(a => a.id === el.dataset.articleId);
                    if (article) this.loadArticle(article);
                });
            });
        } catch (err) {
            console.error('Error loading recent changes:', err);
            document.getElementById('articleContent').innerHTML = '<p>Error loading recent changes.</p>';
        } finally {
            this.hideLoading();
        }
    }

    // Show random article
    async showRandomArticle() {
        this.showLoading();

        try {
            const articles = await this.wikiClient.searchArticles('', 100);
            
            if (articles.length === 0) {
                alert('No articles found');
                return;
            }

            const randomArticle = articles[Math.floor(Math.random() * articles.length)];
            await this.loadArticle(randomArticle);
        } catch (err) {
            console.error('Error loading random article:', err);
            alert('Error loading random article');
        } finally {
            this.hideLoading();
        }
    }

    // Render markdown (simple implementation)
    renderMarkdown(content) {
        if (!content) return '';

        let html = content;

        // Headers
        html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
        html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
        html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');

        // Bold
        html = html.replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>');
        html = html.replace(/\_\_(.*?)\_\_/gim, '<strong>$1</strong>');

        // Italic
        html = html.replace(/\*(.*?)\*/gim, '<em>$1</em>');
        html = html.replace(/\_(.*?)\_/gim, '<em>$1</em>');

        // Links
        html = html.replace(/\[(.*?)\]\((.*?)\)/gim, '<a href="$2">$1</a>');

        // Code blocks
        html = html.replace(/```(.*?)```/gims, '<pre><code>$1</code></pre>');
        html = html.replace(/`(.*?)`/gim, '<code>$1</code>');

        // Line breaks
        html = html.replace(/\n\n/g, '</p><p>');
        html = html.replace(/\n/g, '<br>');

        // Wrap in paragraphs
        html = '<p>' + html + '</p>';

        return html;
    }

    // Show loading indicator
    showLoading() {
        document.getElementById('loadingIndicator').style.display = 'flex';
    }

    // Hide loading indicator
    hideLoading() {
        document.getElementById('loadingIndicator').style.display = 'none';
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.app = new NostipediaApp();
});