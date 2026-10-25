namespace ApiDot.Core.Variables;

public interface IVariableInterpolator
{
    string Interpolate(string template, IReadOnlyDictionary<string, string> variables);
}
