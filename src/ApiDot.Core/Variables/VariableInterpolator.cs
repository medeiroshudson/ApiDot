using System.Diagnostics.CodeAnalysis;
using System.Text.RegularExpressions;

namespace ApiDot.Core.Variables;

public partial class VariableInterpolator : IVariableInterpolator
{
    [GeneratedRegex(@"\{\{\s*([a-zA-Z0-9_\.\$-]+)\s*\}\}")]
    private static partial Regex VariableRegex();

    [return: NotNullIfNotNull(nameof(template))]
    public string? Interpolate(string? template, IReadOnlyDictionary<string, string>? variables)
    {
        if (string.IsNullOrEmpty(template)) return template;

        return VariableRegex().Replace(template, match =>
        {
            var key = match.Groups[1].Value;

            if (key.Equals("$guid", StringComparison.OrdinalIgnoreCase))
                return Guid.NewGuid().ToString();

            if (key.Equals("$timestamp", StringComparison.OrdinalIgnoreCase))
                return DateTimeOffset.UtcNow.ToUnixTimeSeconds().ToString();

            if (key.Equals("$randomInt", StringComparison.OrdinalIgnoreCase))
                return Random.Shared.Next(1000, 10000).ToString();

            return (variables != null && variables.TryGetValue(key, out var value)) ? value : match.Value;
        });
    }
}
