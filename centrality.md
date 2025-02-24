# **Map.dn42 Index: A Comprehensive Centrality Metric**

To design a comprehensive index that measures the importance of each node in the DN42 BGP network, we combine three core graph centrality measures:

- **Betweenness Centrality** (\( B_i \)): Measures how often a node acts as a bridge along the shortest path between other nodes.
- **Closeness Centrality** (\( C_i \)): Measures how close a node is to all other nodes in terms of the shortest path.
- **Degree Centrality** (\( D_i \)): Counts the number of direct connections a node has.

---

## **Normalization**

To ensure fairness and comparability, we normalize each centrality metric to a scale from 0 to 1:

\[
\hat{B}_i = \frac{B_i}{\max(B)}, \quad \hat{C}_i = \frac{C_i}{\max(C)}, \quad \hat{D}_i = \frac{D_i}{\max(D)}
\]

Where:
- \( \hat{B}_i, \hat{C}_i, \hat{D}_i \) are the normalized values.
- \( \max(B), \max(C), \max(D) \) represent the highest values across all nodes for each respective centrality.

---

## **Map.dn42 Index Formula**

The final DN42 Index for each node \( i \) is calculated as a weighted sum of the normalized metrics:

\[
\text{DN42 Index}_i = \alpha \cdot \hat{B}_i + \beta \cdot \hat{C}_i + \gamma \cdot \hat{D}_i
\]

Where:
- \( \alpha, \beta, \gamma \) are weights assigned to each centrality, and they can be adjusted based on the network’s priorities.
- Example values:
  - \( \alpha = 0.5 \) (Priority on bridging roles)
  - \( \beta = 0.3 \) (Priority on overall connectedness)
  - \( \gamma = 0.2 \) (Priority on local influence)

---

## **Sample Implementation (JavaScript)**

```js
function calculateDN42Index(nodes) {
    // Extract centrality values
    const betweenness = nodes.map(n => n.betweenness);
    const closeness = nodes.map(n => n.closeness);
    const degree = nodes.map(n => n.degree);

    // Normalize the centralities
    const maxBetweenness = Math.max(...betweenness);
    const maxCloseness = Math.max(...closeness);
    const maxDegree = Math.max(...degree);

    // Weights for each centrality
    const alpha = 0.5;
    const beta = 0.3;
    const gamma = 0.2;

    // Compute DN42 Index for each node
    nodes.forEach(node => {
        const normBetweenness = node.betweenness / maxBetweenness;
        const normCloseness = node.closeness / maxCloseness;
        const normDegree = node.degree / maxDegree;

        node.dn42Index = (alpha * normBetweenness) +
                         (beta * normCloseness) +
                         (gamma * normDegree);
    });

    // Sort nodes based on DN42 Index (descending order)
    nodes.sort((a, b) => b.dn42Index - a.dn42Index);

    return nodes;
}
