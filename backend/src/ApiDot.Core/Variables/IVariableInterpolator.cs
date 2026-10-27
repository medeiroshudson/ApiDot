using System.Diagnostics.CodeAnalysis;

namespace ApiDot.Core.Variables;

public interface IVariableInterpolator
{
    [return: NotNullIfNotNull(nameof(template))]
    string? Interpolate(string? template, IReadOnlyDictionary<string, string>? variables);

    [return: NotNullIfNotNull(nameof(template))]
    string? Interpolate(string? template, IReadOnlyDictionary<string, string>? variables, IResponseHistoryProvider? responseHistoryProvider);

    [return: NotNullIfNotNull(nameof(url))]
    string? InterpolatePathParameters(string? url, IReadOnlyDictionary<string, string>? pathParameters);
}
