using System.Data.Common;
using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore.Diagnostics;

namespace ApiDot.Server.Security;

public class WorkspaceScopeInterceptor(ICurrentUserContext currentUserContext) : DbCommandInterceptor
{
    private const string ScopeMarker = "/* __ws_scope__ */";
    private const string SqlClauses = "WHERE|JOIN|LEFT|RIGHT|INNER|CROSS|FULL|OUTER|ON|ORDER|GROUP|LIMIT|HAVING|UNION|WINDOW|SET";

    private static readonly Regex SelectOrWithCommandRegex = new(
        @"^\s*(?:(?:--[^\r\n]*[\r\n]+|/\*[\s\S]*?\*/\s*)*)(?:SELECT|WITH)\b",
        RegexOptions.IgnoreCase | RegexOptions.Compiled);

    private static readonly Regex WorkspaceTableRegex = new(
        @"(?<prefix>\b(?:FROM|(?:LEFT\s+|RIGHT\s+|INNER\s+|CROSS\s+)?JOIN)\s+)(?:""Workspaces""|\[Workspaces\]|`Workspaces`|\bWorkspaces\b)(?:\s+(?:AS\s+(?<alias>""[^""]+""|\[[^\]]+\]|`[^`]+`|\w+)|(?!(?:" + SqlClauses + @")\b)(?<alias>""[^""]+""|\[[^\]]+\]|`[^`]+`|\w+)))?",
        RegexOptions.IgnoreCase | RegexOptions.Compiled | RegexOptions.Multiline);

    public override InterceptionResult<DbDataReader> ReaderExecuting(
        DbCommand command,
        CommandEventData eventData,
        InterceptionResult<DbDataReader> result)
    {
        ManipulateCommand(command);
        return base.ReaderExecuting(command, eventData, result);
    }

    public override ValueTask<InterceptionResult<DbDataReader>> ReaderExecutingAsync(
        DbCommand command,
        CommandEventData eventData,
        InterceptionResult<DbDataReader> result,
        CancellationToken cancellationToken = default)
    {
        ManipulateCommand(command);
        return base.ReaderExecutingAsync(command, eventData, result, cancellationToken);
    }

    public override InterceptionResult<object> ScalarExecuting(
        DbCommand command,
        CommandEventData eventData,
        InterceptionResult<object> result)
    {
        ManipulateCommand(command);
        return base.ScalarExecuting(command, eventData, result);
    }

    public override ValueTask<InterceptionResult<object>> ScalarExecutingAsync(
        DbCommand command,
        CommandEventData eventData,
        InterceptionResult<object> result,
        CancellationToken cancellationToken = default)
    {
        ManipulateCommand(command);
        return base.ScalarExecutingAsync(command, eventData, result, cancellationToken);
    }

    private void ManipulateCommand(DbCommand command)
    {
        if (currentUserContext.IsRoot)
        {
            return;
        }

        if (string.IsNullOrWhiteSpace(command.CommandText))
        {
            return;
        }

        if (command.CommandText.Contains(ScopeMarker, StringComparison.OrdinalIgnoreCase))
        {
            return;
        }

        if (!SelectOrWithCommandRegex.IsMatch(command.CommandText))
        {
            return;
        }

        if (!command.CommandText.Contains("Workspaces", StringComparison.OrdinalIgnoreCase))
        {
            return;
        }

        string filter;
        if (currentUserContext.UserId.HasValue)
        {
            var userId = currentUserContext.UserId.Value;
            var upperGuid = userId.ToString().ToUpperInvariant();
            filter = $"\"Id\" IN (SELECT \"wm\".\"WorkspaceId\" FROM \"WorkspaceMembers\" AS \"wm\" WHERE \"wm\".\"UserId\" = '{upperGuid}' COLLATE NOCASE)";
        }
        else
        {
            filter = "1 = 0";
        }

        command.CommandText = WorkspaceTableRegex.Replace(command.CommandText, match =>
        {
            var prefix = match.Groups["prefix"].Value;
            var alias = match.Groups["alias"].Value;

            var aliasSql = string.IsNullOrWhiteSpace(alias) ? "\"Workspaces\"" : alias;
            return $"{prefix}(SELECT * FROM \"Workspaces\" {ScopeMarker} WHERE {filter}) AS {aliasSql}";
        });
    }
}
