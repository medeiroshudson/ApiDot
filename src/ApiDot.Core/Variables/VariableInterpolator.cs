using System.Text.RegularExpressions;

namespace ApiDot.Core.Variables;

public partial class VariableInterpolator : IVariableInterpolator
{
    [GeneratedRegex(@"\{\{([a-zA-Z0-9_\.\$]+)\}\}")]
    private static partial Regex VariableRegex();

    public string Interpolate(string template, IReadOnlyDictionary<string, string> variables)
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
                return Random.Shared.Next(1000, 9999).ToString();

            return (variables != null && variables.TryGetValue(key, out var val)) ? val : match.Value;
        });
    }
}
